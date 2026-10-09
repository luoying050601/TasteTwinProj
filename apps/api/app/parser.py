import re
from .models import Constraints, InterpretRequest
from .nutrition import calculate_gap

KNOWN_ALLERGENS = {"peanut": ["花生", "peanut"], "milk": ["牛奶", "乳制品", "milk", "dairy"],
    "egg": ["鸡蛋", "egg"], "soy": ["大豆", "soy"], "wheat": ["小麦", "wheat"],
    "fish": ["鱼", "fish"], "shellfish": ["虾", "贝类", "shellfish"], "sesame": ["芝麻", "sesame"]}

def interpret(body: InterpretRequest):
    text = body.message.lower().replace(",", "")
    if not text.strip():
        raise ValueError("先告诉我你现在想吃什么")
    c = Constraints(allergens=list(dict.fromkeys(body.allergens)))
    for name, words in {"Japanese": ["日式", "日本料理", "japanese"], "Italian": ["意式", "italian"], "Chinese": ["中餐", "chinese"]}.items():
        if any(word in text for word in words): c.cuisines.append(name)
    if "安静" in text or "quiet" in text: c.ambience = ["quiet"]
    if "一个人" in text or "solo" in text: c.partySize = 1
    money = re.search(r"(?:¥|￥)\s*(\d+(?:\.\d+)?)|(?:under|below|以内|预算)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:日元|円|yen|jpy)", text)
    if money:
        value = next(x for x in money.groups() if x is not None)
        if float(value) <= 0: raise ValueError("预算必须大于 0")
        c.budgetMax = float(value)
        if re.search(r"¥|￥|日元|円|yen|jpy", text): c.currency = "JPY"
    walk = re.search(r"(\d+)\s*(?:分钟|min)", text)
    if walk: c.maxWalkMinutes = int(walk.group(1))
    elif "附近" in text or "nearby" in text: c.maxWalkMinutes = 15
    c.excludeSpicy = any(x in text for x in ["不要辣", "不吃辣", "不辣", "not spicy", "no spicy"])
    # Rule parser is deliberately conservative; use the explicit allergen field for guaranteed collection.
    if "过敏" in text or "allerg" in text or "不能吃" in text:
        for allergen, words in KNOWN_ALLERGENS.items():
            if any(x in text for x in words): c.allergens.append(allergen)
    c.allergens = list(dict.fromkeys(c.allergens))
    gap = calculate_gap(body.dailySummary)
    missing = []
    if not body.location.city.strip(): missing.append("搜索区域")
    if c.budgetMax is not None and c.currency is None: missing.append("预算币种（例如日元）")
    parts = c.cuisines + c.ambience
    if c.budgetMax is not None: parts.append(f"预算 {c.budgetMax:g} {c.currency or '币种待确认'}")
    if c.maxWalkMinutes: parts.append(f"步行 {c.maxWalkMinutes} 分钟以内")
    if c.partySize: parts.append(f"{c.partySize} 人用餐")
    if c.excludeSpicy: parts.append("不要辣")
    if c.allergens: parts.append("排除过敏原：" + ", ".join(c.allergens))
    return {"confirmationText": "我理解你的需求是：" + "、".join(parts or ["按口味与地点寻找下一餐"]) + "。请确认后继续。",
        "constraints": c.model_dump(), "nutritionGap": gap,
        "needsClarification": bool(missing), "clarificationQuestion": "请补充" + "、".join(missing) if missing else None,
        "parserMode": "rules", "location": body.location.model_dump(),
        "notice": "当前为有限规则解析器，尚未接入 LLM / Agent 框架；请核对预算、菜系和过敏原。"}

def refine_constraints(current: dict, text: str):
    c = Constraints(**current).model_copy(deep=True)
    before = c.model_dump()
    t = text.lower()
    if any(x in t for x in ["近", "closer"]): c.maxWalkMinutes = max(1, (c.maxWalkMinutes or 15)-5)
    if any(x in t for x in ["便宜", "cheap"]):
        if c.currency is None: raise ValueError("更便宜需要先确认预算币种")
        c.budgetMax = max(1, (c.budgetMax or 1200)*.8)
    if any(x in t for x in ["不要辣", "不辣", "no spicy", "not spicy"]): c.excludeSpicy = True
    after = c.model_dump()
    changes = [{"field": k, "from": before[k], "to": after[k]} for k in after if after[k] != before[k]]
    if not changes: raise ValueError("框架版支持：再近一点、更便宜、不要辣。条件已生效时无需重复提交。")
    return after, changes
