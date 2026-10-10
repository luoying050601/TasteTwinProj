import os
from pathlib import Path
import asyncio
from contextlib import asynccontextmanager
import time
import logging
from uuid import uuid4
from copy import deepcopy
from dotenv import load_dotenv
from fastapi import FastAPI, Query, Request, Depends
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from .models import (
    InterpretRequest,
    RecommendRequest,
    RefineRequest,
    SelectRequest,
    PlacesRequest,
)
from .parser import interpret, refine_constraints
from .qloo import FixtureTasteProvider, LiveQlooProvider, QlooError
from .catalog import CATALOG, CatalogError, load_menu_catalog
from .ranking import eligible, rank
from .i18n import normalize_locale, text as tr, localize_recommendation
from .auth import (
    AuthError,
    ProfileUpdate,
    auth_service,
    current_account,
    complete_account,
)
from .notebook import NotebookError, DietaryPreferences, HealthCreate, notebook_store

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


app = FastAPI(
    lifespan=lifespan,
    title="TasteTwin API",
    version="0.2.0",
    description="Nutrition-aware meal recommendations and Qloo cultural taste discovery. Menu provenance is separate from place affinity.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        x.strip()
        for x in os.getenv(
            "WEB_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
        ).split(",")
    ],
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Accept-Language", "Authorization"],
)
logger = logging.getLogger("uvicorn.error")
sessions: dict = {}
TTL = int(os.getenv("SESSION_TTL_SECONDS", "3600"))
MAX_SESSIONS = 500


class AppError(Exception):
    def __init__(self, code, message, status=400, retryable=False):
        self.code, self.message, self.status, self.retryable = (
            code,
            message,
            status,
            retryable,
        )


def get_session(session_id, user_id):
    session = sessions.get(str(session_id))
    if not session or time.time() - session["createdAt"] > TTL:
        sessions.pop(str(session_id), None)
        raise AppError("SESSION_EXPIRED", "本次会话已结束，请重新开始", 404)
    if session.get("userId") != user_id:
        raise AppError("SESSION_EXPIRED", "SESSION_EXPIRED", 404)
    return session


@app.middleware("http")
async def request_metadata(request: Request, call_next):
    request.state.locale = normalize_locale(
        request.headers.get("accept-language", "en-US")
    )
    request.state.request_id = "req_" + str(uuid4())
    start = time.monotonic()
    response = await call_next(request)
    response.headers["X-Request-ID"] = request.state.request_id
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    logger.info(
        "requestId=%s method=%s path=%s status=%s latencyMs=%d",
        request.state.request_id,
        request.method,
        request.url.path,
        response.status_code,
        (time.monotonic() - start) * 1000,
    )
    return response


def ok(request, data, warnings=None):
    return {
        "ok": True,
        "requestId": request.state.request_id,
        "data": data,
        "warnings": warnings or [],
    }


def error_response(request, code, message, status, retryable=False):
    return JSONResponse(
        status_code=status,
        content={
            "ok": False,
            "requestId": request.state.request_id,
            "error": {
                "code": code,
                "message": tr(request.state.locale, code),
                "retryable": retryable,
            },
        },
    )


@app.exception_handler(AppError)
async def app_error(request, exc):
    return error_response(request, exc.code, exc.message, exc.status, exc.retryable)


@app.exception_handler(AuthError)
async def auth_error(request, exc):
    return error_response(request, exc.code, exc.code, exc.status, exc.retryable)


@app.get("/api/me")
async def my_profile(request: Request, account=Depends(current_account)):
    return ok(request, account.public())


@app.patch("/api/me")
async def update_my_profile(
    body: ProfileUpdate,
    request: Request,
    account=Depends(current_account),
    service=Depends(auth_service),
):
    updated = await service.update(account, body)
    for sid in list(sessions):
        if sessions[sid].get("userId") == account.id:
            sessions.pop(sid, None)
    return ok(request, updated.public())


@app.exception_handler(NotebookError)
async def notebook_error(request, exc):
    return error_response(request, exc.code, exc.code, exc.status, exc.retryable)


@app.get("/api/me/dietary-preferences")
async def dietary_preferences(
    request: Request, account=Depends(complete_account), store=Depends(notebook_store)
):
    data = await store.dietary(account)
    return ok(request, data.model_dump(mode="json", by_alias=True))


@app.patch("/api/me/dietary-preferences")
async def save_dietary_preferences(
    body: DietaryPreferences,
    request: Request,
    account=Depends(complete_account),
    store=Depends(notebook_store),
):
    data = await store.save_dietary(account, body)
    return ok(request, data.model_dump(mode="json", by_alias=True))


@app.get("/api/me/health-records")
async def health_records(
    request: Request,
    offset: int = Query(default=0, ge=0, le=100000),
    limit: int = Query(default=20, ge=1, le=50),
    account=Depends(complete_account),
    store=Depends(notebook_store),
):
    return ok(request, await store.history(account, offset, limit))


@app.post("/api/me/health-records")
async def add_health_record(
    body: HealthCreate,
    request: Request,
    account=Depends(complete_account),
    store=Depends(notebook_store),
):
    return ok(request, await store.add_health(account, body))


@app.exception_handler(QlooError)
async def qloo_error(request, exc):
    return error_response(
        request,
        exc.code,
        exc.code,
        503,
        exc.code in {"QLOO_UNAVAILABLE", "QLOO_RATE_LIMITED"},
    )


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    # Do not echo request bodies or health inputs in errors/logs.
    fields = ", ".join(".".join(map(str, e["loc"][1:])) for e in exc.errors())
    return error_response(request, "VALIDATION_ERROR", "请检查输入字段：" + fields, 422)


@app.exception_handler(CatalogError)
async def catalog_error(request, exc):
    return error_response(request, "MENU_CATALOG_INVALID", "MENU_CATALOG_INVALID", 503)


@app.exception_handler(Exception)
async def unexpected_error(request, exc):
    logger.error(
        "requestId=%s errorType=%s", request.state.request_id, type(exc).__name__
    )
    return error_response(
        request, "UNKNOWN", "这次没有完成，请重试或重新开始", 500, True
    )


@app.get("/api/health")
async def health(request: Request):
    return ok(
        request,
        {
            "status": "ok",
            "version": app.version,
            "dataMode": os.getenv("DATA_MODE", "fixture"),
            "qloo": (
                "configured_not_verified"
                if os.getenv("QLOO_API_KEY")
                else "not_configured"
            ),
            "menuCatalog": (
                "synthetic_fixture"
                if os.getenv("DATA_MODE", "fixture") == "fixture"
                else (
                    "catalog_configured_not_verified"
                    if os.getenv("MENU_CATALOG_PATH")
                    else "not_configured"
                )
            ),
            "parser": "rules",
            "persistence": "supabase_profiles_and_temporary_meal_sessions",
            "auth": (
                "configured_not_verified"
                if os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_PUBLISHABLE_KEY")
                else "not_configured"
            ),
        },
    )


def place_result(place):
    return {
        "qlooEntityId": place.entity_id,
        "placeName": place.name,
        "affinity": place.affinity,
        "properties": place.properties,
        "explainability": place.explainability,
        "menu": None,
        "nutrition": None,
        "allergenStatus": "unknown",
        "provenance": {
            "place": "qloo",
            "taste": "qloo",
            "menu": "unavailable",
            "nutrition": "unavailable",
        },
    }


@app.post("/api/places")
async def discover_places(
    body: PlacesRequest, request: Request, account=Depends(complete_account)
):
    places = await LiveQlooProvider().places(
        city=body.location.city,
        lat=body.location.lat,
        lng=body.location.lng,
        radius_m=body.radiusMeters,
        entity_ids=[str(value) for value in body.tasteProfile.likedEntityIds],
        tag_ids=body.tasteProfile.likedTagIds,
        limit=body.limit,
    )
    personalized = bool(
        body.tasteProfile.likedEntityIds or body.tasteProfile.likedTagIds
    )
    return ok(
        request,
        {
            "places": [place_result(place) for place in places],
            "qlooUsed": True,
            "personalized": personalized,
            "dataMode": "live_qloo",
        },
        ["PLACE_DISCOVERY_ONLY_NOT_NUTRITION_OR_ALLERGY_VERIFIED"]
        + ([] if personalized else ["NO_PERSONAL_TASTE_SIGNALS"]),
    )


@app.get("/api/taste/tags")
async def taste_tags(
    request: Request,
    query: str = Query(min_length=1, max_length=80),
    account=Depends(complete_account),
):
    return ok(request, {"tags": await LiveQlooProvider().tags(query)})


@app.post("/api/interpret")
async def parse(
    body: InterpretRequest, request: Request, account=Depends(complete_account)
):
    existing = sessions.get(str(body.sessionId))
    if existing and existing.get("userId") != account.id:
        raise AppError("SESSION_EXPIRED", "SESSION_EXPIRED", 404)
    try:
        parsed = interpret(body)
    except ValueError as exc:
        raise AppError("VALIDATION_ERROR", str(exc))
    now = time.time()
    for sid in list(sessions):
        if now - sessions[sid]["createdAt"] > TTL:
            sessions.pop(sid, None)
    if str(body.sessionId) not in sessions and len(sessions) >= MAX_SESSIONS:
        raise AppError("SESSION_CAPACITY", "演示会话已满，请稍后重试", 503, True)
    sessions[str(body.sessionId)] = {
        "userId": account.id,
        "createdAt": now,
        "parsed": parsed,
        "candidates": None,
        "tasteOrder": {},
        "enabled": True,
        "visible": [],
        "changes": [],
        "selected": None,
        "context": {
            **body.model_dump(mode="json", exclude={"message"}),
            "accountProfile": account.public(),
        },
        "tasteProfile": body.tasteProfile.model_dump(mode="json"),
        "affinities": {},
        "places": [],
        "qlooStatus": "not_requested",
        "qlooWarnings": [],
        "tasteCachedAt": 0,
        "lock": asyncio.Lock(),
    }
    return ok(request, parsed, parsed["nutritionAssessment"]["warnings"])


async def ensure_candidates(session):
    if session["parsed"]["needsClarification"]:
        raise AppError(
            "CLARIFICATION_REQUIRED", session["parsed"]["clarificationQuestion"]
        )
    city = session["parsed"]["location"]["city"].lower()
    if session["candidates"] is None:
        mode = os.getenv("DATA_MODE", "fixture")
        if mode not in {"fixture", "live_qloo"}:
            raise AppError("DATA_MODE_INVALID", "DATA_MODE_INVALID", 503)
        session["mode"] = mode
        if mode == "fixture" and not any(
            x in city for x in ["tokyo", "东京", "東京", "shibuya", "涩谷", "渋谷"]
        ):
            raise AppError(
                "FIXTURE_LOCATION_UNSUPPORTED", "FIXTURE_LOCATION_UNSUPPORTED"
            )
        session["catalog"] = (
            CATALOG
            if mode == "fixture"
            else load_menu_catalog(session["parsed"]["location"])
        )
        c = session["parsed"]["constraints"]
        session["candidates"] = eligible(c, session["catalog"])
        if mode == "fixture":
            session["tasteOrder"] = await FixtureTasteProvider().rank_places(
                cuisines=c["cuisines"], ambience=c["ambience"], city=city
            )


async def ensure_taste(session):
    if session["mode"] == "fixture":
        session["qlooStatus"] = "fixture"
        return
    if not session["enabled"]:
        session["qlooStatus"] = "disabled"
        return
    if time.time() - session["tasteCachedAt"] < 300:
        session["qlooStatus"] = session["cachedStatus"]
        if session["qlooStatus"] == "used" and not any(
            item["qlooEntityId"].lower() in session["affinities"]
            for item in session["candidates"]
        ):
            session["qlooStatus"] = "no_matched_menu_signals"
        return
    session["affinities"] = {}
    session["places"] = []
    session["qlooWarnings"] = []
    if session["catalog"] and not session["candidates"]:
        session["qlooStatus"] = "no_eligible_menus"
        return
    try:
        async with asyncio.timeout(12):
            provider = LiveQlooProvider()
            profile = session["tasteProfile"]
            tags = list(profile["likedTagIds"])
            constraints = session["parsed"]["constraints"]
            for term in constraints["cuisines"] + constraints["ambience"]:
                matches = await provider.tags(term)
                exact = [
                    tag["tagId"]
                    for tag in matches
                    if tag["name"].casefold() == term.casefold()
                ]
                if len(exact) == 1:
                    tags.extend(exact)
                else:
                    session["qlooWarnings"].append("TASTE_TAG_UNRESOLVED_" + term)
            tags = list(dict.fromkeys(tags))
            location = session["parsed"]["location"]
            identifiers = list(
                dict.fromkeys(item["qlooEntityId"] for item in session["candidates"])
            )
            places = []
            batches = [
                identifiers[offset : offset + 50]
                for offset in range(0, len(identifiers), 50)
            ] or [None]
            for batch in batches:
                places.extend(
                    await provider.places(
                        city=location["city"],
                        lat=location["lat"],
                        lng=location["lng"],
                        entity_ids=profile["likedEntityIds"],
                        tag_ids=tags,
                        candidate_ids=batch,
                        limit=50,
                    )
                )
            personalized = bool(profile["likedEntityIds"] or tags)
            session["affinities"] = (
                {place.entity_id: place for place in places} if personalized else {}
            )
            session["places"] = [place_result(place) for place in places]
            session["qlooStatus"] = (
                "used"
                if personalized
                and any(
                    item["qlooEntityId"].lower() in session["affinities"]
                    for item in session["candidates"]
                )
                else "discovery_only" if personalized else "no_personal_signals"
            )
            if not personalized:
                session["qlooWarnings"].append("NO_PERSONAL_TASTE_SIGNALS")
            if identifiers and session["qlooStatus"] != "used":
                session["qlooWarnings"].append("QLOO_NO_MATCHED_MENU_SIGNALS")
            session["tasteCachedAt"] = time.time()
            session["cachedStatus"] = session["qlooStatus"]
    except (QlooError, TimeoutError) as exc:
        session["qlooStatus"] = "fallback"
        session["qlooWarnings"].append(
            exc.code if isinstance(exc, QlooError) else "QLOO_UNAVAILABLE"
        )


def result_warnings(session, locale):
    warnings = list(session["parsed"]["nutritionAssessment"]["warnings"])
    if session["mode"] == "fixture":
        warnings.append(tr(locale, "dataNotice"))
    else:
        if not session["catalog"]:
            warnings.append("NO_VERIFIED_MENU_CATALOG")
        if session["places"] and session["enabled"]:
            warnings.append("PLACE_DISCOVERY_ONLY_NOT_NUTRITION_OR_ALLERGY_VERIFIED")
        if session["enabled"]:
            warnings.extend(session["qlooWarnings"])
    return warnings


def response_results(session, limit, locale="en-US"):
    gap = session["parsed"]["nutritionGap"]
    options = {
        "assessment": session["parsed"]["nutritionAssessment"],
        "affinities": session["affinities"] if session["mode"] == "live_qloo" else None,
    }
    recommendations = rank(
        session["candidates"],
        gap,
        session["tasteOrder"],
        session["enabled"],
        limit,
        **options
    )
    recommendations = [
        localize_recommendation(item, locale, gap) for item in recommendations
    ]
    session["visible"] = recommendations
    all_count = max(1, len(session["candidates"]))
    return {
        "dataMode": (
            "fixture"
            if session["mode"] == "fixture" and session["enabled"]
            else (
                "live_qloo"
                if session["enabled"] and session["qlooStatus"] == "used"
                else "baseline"
            )
        ),
        "candidateSource": (
            "fixture" if session["mode"] == "fixture" else "menu_catalog"
        ),
        "qlooUsed": session["enabled"]
        and any(item["provenance"]["taste"] == "qloo" for item in recommendations),
        "qlooStatus": session["qlooStatus"],
        "placeDiscovery": session["places"] if session["enabled"] else [],
        "nutritionAssessment": session["parsed"]["nutritionAssessment"],
        "recommendations": recommendations,
        "constraints": session["parsed"]["constraints"],
        "appliedChanges": session["changes"],
        "comparison": {
            "candidateIds": [x["candidateId"] for x in session["candidates"]],
            "withTaste": [
                x["candidateId"]
                for x in rank(
                    session["candidates"],
                    gap,
                    session["tasteOrder"],
                    True,
                    all_count,
                    **options
                )
            ],
            "withoutTaste": [
                x["candidateId"]
                for x in rank(
                    session["candidates"],
                    gap,
                    session["tasteOrder"],
                    False,
                    all_count,
                    **options
                )
            ],
            "label": tr(
                locale,
                "compareLabel" if session["mode"] == "fixture" else "liveCompareLabel",
            ),
            "tasteComparisonAvailable": (
                bool(session["affinities"]) if session["mode"] == "live_qloo" else True
            ),
        },
        "trace": [
            {
                "tool": x,
                "status": (
                    session["qlooStatus"] if x == "taste_provider" else "completed"
                ),
                "mode": session["mode"] if x == "taste_provider" else "rules",
            }
            for x in [
                "nutrition_gap",
                "safety_filter",
                "taste_provider",
                "menu_catalog",
                "eligibility_filter",
                "rank_meals",
            ]
        ],
        "emptyMessage": None if recommendations else tr(locale, "EMPTY"),
    }


@app.post("/api/recommend")
async def recommend(
    body: RecommendRequest, request: Request, account=Depends(complete_account)
):
    s = get_session(body.sessionId, account.id)
    async with s["lock"]:
        s["enabled"] = body.qlooEnabled
        await ensure_candidates(s)
        await ensure_taste(s)
        s["selected"] = None
        return ok(
            request,
            response_results(s, body.limit, request.state.locale),
            result_warnings(s, request.state.locale),
        )


@app.post("/api/refine")
async def refine(
    body: RefineRequest, request: Request, account=Depends(complete_account)
):
    s = get_session(body.sessionId, account.id)
    async with s["lock"]:
        if s["candidates"] is None:
            raise AppError("SEARCH_REQUIRED", "请先确认并查找")
        try:
            constraints, changes = refine_constraints(
                s["parsed"]["constraints"], body.refinement, request.state.locale
            )
        except ValueError as exc:
            raise AppError("REFINEMENT_UNSUPPORTED", str(exc))
        s["parsed"]["constraints"] = constraints
        s["changes"].extend(changes)
        s["candidates"] = eligible(constraints, s["catalog"])
        await ensure_taste(s)
        s["selected"] = None
        return ok(
            request,
            response_results(s, 2, request.state.locale),
            result_warnings(s, request.state.locale),
        )


@app.post("/api/select")
async def select(
    body: SelectRequest, request: Request, account=Depends(complete_account)
):
    s = get_session(body.sessionId, account.id)
    item = next((x for x in s["visible"] if x["candidateId"] == body.candidateId), None)
    if not item:
        raise AppError(
            "CANDIDATE_NOT_AVAILABLE", "这项已不在当前结果中，请重新选择", 409
        )
    item = localize_recommendation(
        item, request.state.locale, s["parsed"]["nutritionGap"]
    )
    s["selected"] = deepcopy(item)
    return ok(
        request,
        {
            "selected": True,
            "recommendation": item,
            "preview": {
                **item["nutritionContribution"],
                **{
                    k: item[k] for k in ["price", "currency", "walkMinutes", "tasteFit"]
                },
            },
            "twinMessage": tr(request.state.locale, "twinFeedback"),
        },
    )


@app.delete("/api/sessions/{session_id}")
async def delete_session(
    session_id: str, request: Request, account=Depends(complete_account)
):
    if session_id in sessions:
        get_session(session_id, account.id)
    sessions.pop(session_id, None)
    return ok(request, {"deleted": True})


@app.get("/api/sessions/{session_id}")
async def session_records(
    session_id: str, request: Request, account=Depends(complete_account)
):
    session = get_session(session_id, account.id)
    return ok(
        request,
        {
            "context": session["context"],
            "nutritionAssessment": session["parsed"]["nutritionAssessment"],
            "expiresAt": session["createdAt"] + TTL,
        },
    )


# Render serves the compiled web app alongside /api; Vercel remains independent.
web_dist = Path(__file__).parent / "static"
if web_dist.is_dir():
    if (web_dist / "assets").is_dir():
        app.mount(
            "/assets", StaticFiles(directory=web_dist / "assets"), name="web-assets"
        )

    @app.get("/{web_path:path}", include_in_schema=False)
    async def web_page(web_path: str):
        if web_path == "api" or web_path.startswith("api/"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        candidate = (web_dist / web_path).resolve()
        if candidate.is_relative_to(web_dist.resolve()) and candidate.is_file():
            return FileResponse(candidate)
        if Path(web_path).suffix:
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        return FileResponse(web_dist / "index.html")
