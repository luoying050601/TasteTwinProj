import re
from .models import Constraints, InterpretRequest
from .nutrition import calculate_gap, assess_nutrition
from .i18n import text as tr

KNOWN_ALLERGENS = {
    "peanut": ["花生", "peanut", "落花生", "ピーナッツ"],
    "milk": ["牛奶", "乳制品", "milk", "dairy", "乳製品"],
    "egg": ["鸡蛋", "egg", "卵"],
    "soy": ["大豆", "soy"],
    "wheat": ["小麦", "wheat"],
    "fish": ["鱼", "fish"],
    "shellfish": ["虾", "贝类", "shellfish", "えび", "貝"],
    "sesame": ["芝麻", "sesame", "ごま"],
}


def interpret(body: InterpretRequest):
    text = body.message.lower().replace(",", "")
    if not text.strip():
        raise ValueError(tr(body.locale, "MESSAGE_INVALID"))
    c = Constraints(
        allergens=list(
            dict.fromkeys(
                body.allergens
                + (body.personalProfile.allergens if body.personalProfile else [])
            )
        )
    )
    for name, words in {
        "Japanese": ["日式", "日本料理", "japanese", "和食"],
        "Italian": ["意式", "italian", "イタリアン"],
        "Chinese": ["中餐", "chinese", "中華"],
    }.items():
        if any(word in text for word in words):
            c.cuisines.append(name)
    if any(x in text for x in ["安静", "quiet", "静か"]):
        c.ambience = ["quiet"]
    if any(x in text for x in ["一个人", "solo", "一人", "ひとり"]):
        c.partySize = 1
    money = re.search(
        r"(?:¥|￥)\s*(\d+(?:\.\d+)?)|(?:under|below|以内|预算)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:日元|円|yen|jpy)",
        text,
    )
    if money:
        value = next(x for x in money.groups() if x is not None)
        if float(value) <= 0:
            raise ValueError(tr(body.locale, "VALIDATION_ERROR"))
        c.budgetMax = float(value)
        if re.search(r"¥|￥|日元|円|yen|jpy", text):
            c.currency = "JPY"
    walk = re.search(r"(\d+)\s*(?:分钟|min|分)", text)
    if walk:
        c.maxWalkMinutes = int(walk.group(1))
    elif any(x in text for x in ["附近", "nearby", "近く"]):
        c.maxWalkMinutes = 15
    c.excludeSpicy = any(
        x in text
        for x in [
            "不要辣",
            "不吃辣",
            "不辣",
            "not spicy",
            "no spicy",
            "辛くない",
            "辛いものなし",
        ]
    )
    # Rule parser is deliberately conservative; use the explicit allergen field for guaranteed collection.
    if any(x in text for x in ["过敏", "allerg", "不能吃", "アレルギー"]):
        for allergen, words in KNOWN_ALLERGENS.items():
            if any(x in text for x in words):
                c.allergens.append(allergen)
    c.allergens = list(dict.fromkeys(c.allergens))
    daily, assessment = assess_nutrition(
        body.dailySummary, body.personalProfile, body.consumedMeals
    )
    gap = calculate_gap(daily)
    missing = []
    if not body.location.city.strip():
        missing.append(tr(body.locale, "missingCity"))
    if c.budgetMax is not None and c.currency is None:
        missing.append(tr(body.locale, "missingCurrency"))
    parts = [tr(body.locale, x) for x in c.cuisines + c.ambience]
    if c.budgetMax is not None:
        parts.append(
            tr(
                body.locale,
                "budget",
                amount=f"{c.budgetMax:g}",
                currency=c.currency or "?",
            )
        )
    if c.maxWalkMinutes:
        parts.append(tr(body.locale, "walkLimit", count=c.maxWalkMinutes))
    if c.partySize:
        parts.append(tr(body.locale, "party", count=c.partySize))
    if c.excludeSpicy:
        parts.append(tr(body.locale, "notSpicy"))
    parts.extend(
        tr(body.locale, "exclude", name=tr(body.locale, a)) for a in c.allergens
    )
    return {
        "confirmationText": tr(
            body.locale,
            "confirmation",
            items=", ".join(parts or [tr(body.locale, "defaultPreference")]),
        ),
        "constraints": c.model_dump(),
        "nutritionGap": gap,
        "nutritionAssessment": assessment,
        "needsClarification": bool(missing),
        "clarificationQuestion": (
            tr(body.locale, "clarify", fields=", ".join(missing)) if missing else None
        ),
        "parserMode": "rules",
        "location": body.location.model_dump(),
        "notice": tr(body.locale, "parserNotice"),
    }


def refine_constraints(current: dict, text: str, locale: str = "en-US"):
    c = Constraints(**current).model_copy(deep=True)
    before = c.model_dump()
    t = text.lower()
    if any(x in t for x in ["近", "closer"]):
        c.maxWalkMinutes = max(1, (c.maxWalkMinutes or 15) - 5)
    if any(x in t for x in ["便宜", "cheap", "安く"]):
        if c.currency is None:
            raise ValueError(tr(locale, "missingCurrency"))
        c.budgetMax = max(1, (c.budgetMax or 1200) * 0.8)
    if any(
        x in t
        for x in ["不要辣", "不辣", "no spicy", "not spicy", "辛くない", "辛いものなし"]
    ):
        c.excludeSpicy = True
    after = c.model_dump()
    changes = [
        {"field": k, "from": before[k], "to": after[k]}
        for k in after
        if after[k] != before[k]
    ]
    if not changes:
        raise ValueError(tr(locale, "REFINEMENT_UNSUPPORTED"))
    return after, changes
