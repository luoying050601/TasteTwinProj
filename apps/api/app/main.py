import os
import asyncio
from contextlib import asynccontextmanager
import time
import logging
from uuid import uuid4
from copy import deepcopy
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from .models import InterpretRequest, RecommendRequest, RefineRequest, SelectRequest
from .parser import interpret, refine_constraints
from .qloo import FixtureTasteProvider
from .ranking import eligible, rank

load_dotenv()
@asynccontextmanager
async def lifespan(app):
    async def cleanup():
        while True:
            await asyncio.sleep(60)
            now = time.time()
            for sid in list(sessions):
                if now - sessions[sid]["createdAt"] > TTL:
                    sessions.pop(sid, None)
    task = asyncio.create_task(cleanup())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

app = FastAPI(lifespan=lifespan,title="TasteTwin API", version="0.1.0", description="Framework with fixture data and deterministic rule parsing; live integrations are pending.")
app.add_middleware(CORSMiddleware, allow_origins=[x.strip() for x in os.getenv("WEB_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")], allow_methods=["GET","POST","DELETE"], allow_headers=["Content-Type"])
logger = logging.getLogger("uvicorn.error")
sessions: dict = {}
TTL = int(os.getenv("SESSION_TTL_SECONDS", "3600"))
MAX_SESSIONS = 500

class AppError(Exception):
    def __init__(self, code, message, status=400, retryable=False):
        self.code, self.message, self.status, self.retryable = code, message, status, retryable

def get_session(session_id):
    session = sessions.get(str(session_id))
    if not session or time.time()-session["createdAt"] > TTL:
        sessions.pop(str(session_id), None)
        raise AppError("SESSION_EXPIRED", "本次会话已结束，请重新开始", 404)
    return session

@app.middleware("http")
async def request_metadata(request: Request, call_next):
    request.state.request_id = "req_" + str(uuid4())
    start = time.monotonic()
    response = await call_next(request)
    response.headers["X-Request-ID"] = request.state.request_id
    logger.info("requestId=%s method=%s path=%s status=%s latencyMs=%d", request.state.request_id, request.method, request.url.path, response.status_code, (time.monotonic()-start)*1000)
    return response

def ok(request, data, warnings=None):
    return {"ok":True, "requestId":request.state.request_id, "data":data, "warnings": warnings or []}

def error_response(request, code, message, status, retryable=False):
    return JSONResponse(status_code=status, content={"ok":False, "requestId":request.state.request_id, "error":{"code":code,"message":message,"retryable":retryable}})

@app.exception_handler(AppError)
async def app_error(request, exc):
    return error_response(request, exc.code, exc.message, exc.status, exc.retryable)

@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    # Do not echo request bodies or health inputs in errors/logs.
    fields = ", ".join(".".join(map(str, e["loc"][1:])) for e in exc.errors())
    return error_response(request, "VALIDATION_ERROR", "请检查输入字段：" + fields, 422)

@app.exception_handler(Exception)
async def unexpected_error(request, exc):
    logger.error("requestId=%s errorType=%s", request.state.request_id, type(exc).__name__)
    return error_response(request, "UNKNOWN", "这次没有完成，请重试或重新开始", 500, True)

@app.get("/api/health")
async def health(request: Request):
    return ok(request, {"status":"ok", "dataMode":"fixture", "qloo":"not_connected", "menuCatalog":"synthetic_fixture", "parser":"rules", "agentFramework":"not_connected", "persistence":"single_process_memory"})

@app.post("/api/interpret")
async def parse(body: InterpretRequest, request: Request):
    try: parsed = interpret(body)
    except ValueError as exc: raise AppError("VALIDATION_ERROR", str(exc))
    now = time.time()
    for sid in list(sessions):
        if now-sessions[sid]["createdAt"] > TTL: sessions.pop(sid, None)
    if str(body.sessionId) not in sessions and len(sessions) >= MAX_SESSIONS:
        raise AppError("SESSION_CAPACITY", "演示会话已满，请稍后重试", 503, True)
    sessions[str(body.sessionId)] = {"createdAt":now, "parsed":parsed, "candidates":None, "tasteOrder":{}, "enabled":True, "visible":[], "changes":[], "selected":None}
    return ok(request, parsed)

async def ensure_candidates(session):
    if session["parsed"]["needsClarification"]:
        raise AppError("CLARIFICATION_REQUIRED", session["parsed"]["clarificationQuestion"])
    # The fixture is one specific Tokyo demo. Never label it as another city's nearby results.
    city = session["parsed"]["location"]["city"].lower()
    if not any(x in city for x in ["tokyo", "东京", "東京", "shibuya", "涩谷", "渋谷"]):
        raise AppError("FIXTURE_LOCATION_UNSUPPORTED", "演示数据仅覆盖虚构的 Tokyo 场景；请填 Tokyo，其他城市待真实数据接入")
    if session["candidates"] is None:
        c = session["parsed"]["constraints"]
        session["candidates"] = eligible(c)
        session["tasteOrder"] = await FixtureTasteProvider().rank_places(cuisines=c["cuisines"], ambience=c["ambience"], city=city)

def response_results(session, limit):
    gap = session["parsed"]["nutritionGap"]
    recommendations = rank(session["candidates"], gap, session["tasteOrder"], session["enabled"], limit)
    session["visible"] = recommendations
    all_count = max(1, len(session["candidates"]))
    return {"dataMode":"fixture" if session["enabled"] else "baseline", "candidateSource":"fixture", "qlooUsed":False,
        "recommendations":recommendations, "constraints":session["parsed"]["constraints"], "appliedChanges":session["changes"],
        "comparison":{"candidateIds":[x["candidateId"] for x in session["candidates"]],
            "withTaste":[x["candidateId"] for x in rank(session["candidates"],gap,session["tasteOrder"],True,all_count)],
            "withoutTaste":[x["candidateId"] for x in rank(session["candidates"],gap,session["tasteOrder"],False,all_count)],
            "label":"同一合格候选集的演示排序；没有真实 Qloo 证据"},
        "trace":[{"tool":x,"status":"completed","mode":"fixture" if x == "taste_fixture" else "rules"} for x in ["nutrition_gap","safety_filter","taste_fixture","menu_catalog","eligibility_filter","rank_meals"]],
        "emptyMessage":None if recommendations else "没有同时满足全部条件的套餐。可修改原句放宽预算或距离，过敏条件仍需保留。"}

@app.post("/api/recommend")
async def recommend(body: RecommendRequest, request: Request):
    s = get_session(body.sessionId)
    await ensure_candidates(s)
    s["enabled"] = body.qlooEnabled
    s["selected"] = None
    if os.getenv("DATA_MODE", "fixture") != "fixture":
        raise AppError("LIVE_NOT_IMPLEMENTED", "当前框架尚未接入真实 Qloo，请使用 fixture 模式", 503)
    return ok(request, response_results(s, body.limit), ["所有地点、菜单、营养、价格、步行和口味排序均为虚构演示数据；Qloo 未连接。"])

@app.post("/api/refine")
async def refine(body: RefineRequest, request: Request):
    s = get_session(body.sessionId)
    if s["candidates"] is None: raise AppError("SEARCH_REQUIRED", "请先确认并查找")
    try: constraints, changes = refine_constraints(s["parsed"]["constraints"], body.refinement)
    except ValueError as exc: raise AppError("REFINEMENT_UNSUPPORTED", str(exc))
    s["parsed"]["constraints"] = constraints
    s["changes"].extend(changes)
    s["candidates"] = eligible(constraints)
    s["selected"] = None
    return ok(request, response_results(s, 2))

@app.post("/api/select")
async def select(body: SelectRequest, request: Request):
    s = get_session(body.sessionId)
    item = next((x for x in s["visible"] if x["candidateId"] == body.candidateId), None)
    if not item: raise AppError("CANDIDATE_NOT_AVAILABLE", "这项已不在当前结果中，请重新选择", 409)
    s["selected"] = deepcopy(item)
    return ok(request, {"selected":True,"recommendation":item,"preview":{**item["nutritionContribution"], **{k:item[k] for k in ["price","currency","walkMinutes","tasteFit"]}},
        "twinMessage":"这份选择符合你确认的条件；真实餐食的菜单和成分仍需核实。"})

@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str, request: Request):
    sessions.pop(session_id, None)
    return ok(request, {"deleted":True})
