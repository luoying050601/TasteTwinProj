from copy import deepcopy
from .catalog import CATALOG
from .nutrition import score_nutrition, NUTRIENTS

WEIGHTS = {"with_taste": (0.45, 0.35, 0.20), "baseline": (0.70, 0, 0.30)}


def eligible(constraints, catalog=None):
    result = []
    for item in CATALOG if catalog is None else catalog:
        if set(item["allergens"]) & set(constraints["allergens"]):
            continue
        # Unknown ingredient lists cannot pass an active allergy restriction.
        if constraints["allergens"] and item["allergenStatus"] != "known":
            continue
        if constraints["excludeSpicy"] and item["spicy"] is not False:
            continue
        if constraints["currency"] not in [None, item.get("currency", "JPY")]:
            continue
        if (
            constraints["budgetMax"] is not None
            and item["price"] > constraints["budgetMax"]
        ):
            continue
        if constraints["maxWalkMinutes"] and (
            item["walkMinutes"] is None
            or item["walkMinutes"] > constraints["maxWalkMinutes"]
        ):
            continue
        if constraints["cuisines"] and item["cuisine"] not in constraints["cuisines"]:
            continue
        if any(a not in item["ambience"] for a in constraints["ambience"]):
            continue
        result.append(deepcopy(item))
    return result


def rank(
    candidates, gap, taste_order, enabled, limit, *, assessment=None, affinities=None
):
    live = affinities is not None
    taste_available = enabled and (
        any(meal.get("qlooEntityId", "").lower() in affinities for meal in candidates)
        if live
        else bool(taste_order)
    )
    weights = WEIGHTS["with_taste" if taste_available else "baseline"]
    scored = []
    for m in candidates:
        nutrient_key = {"protein": "proteinG", "fiber": "fiberG", "fat": "fatG"}.get(
            gap["nutrient"]
        )
        value = m.get(nutrient_key) if nutrient_key else None
        detail = score_nutrition(m, assessment) if assessment else None
        nutrition = (
            detail["score"]
            if detail
            else (
                min(value / gap["missingAmount"], 1)
                if value is not None and gap["missingAmount"] > 0
                else 0
            )
        )
        taste_rank = taste_order.get(m["candidateId"])
        signal = affinities.get(m.get("qlooEntityId", "").lower()) if live else None
        taste = (
            signal.affinity
            if signal
            else (
                0
                if live
                else (
                    max(0, 1 - (taste_rank - 1) / max(len(taste_order) - 1, 1))
                    if taste_rank
                    else 0
                )
            )
        )
        walk = m["walkMinutes"]
        convenience = 0.5 * max(0, 1 - walk / 60) if walk is not None else 0
        convenience += (
            0.5 * max(0, 1 - m["price"] / 2000)
            if m.get("currency", "JPY") == "JPY"
            else 0
        )
        effective_weights = (
            weights
            if not detail or detail["available"]
            else (0, 0.7, 0.3) if taste_available else (0, 0, 1)
        )
        score = (
            effective_weights[0] * nutrition
            + effective_weights[1] * taste
            + effective_weights[2] * convenience
        )
        scored.append(
            (
                score,
                m,
                taste_rank,
                signal,
                detail,
                taste,
                convenience,
                effective_weights,
            )
        )
    scored.sort(
        key=lambda x: (
            -x[0],
            x[1]["walkMinutes"] if x[1]["walkMinutes"] is not None else float("inf"),
            x[1]["price"],
            x[1]["candidateId"],
        )
    )
    result = []
    for i, (
        score,
        m,
        taste_rank,
        signal,
        detail,
        taste,
        convenience,
        effective_weights,
    ) in enumerate(scored[:limit]):
        source = (
            "qloo"
            if taste_available and signal
            else "fixture" if taste_available and not live else "unavailable"
        )
        provenance = m.get(
            "provenance",
            {
                "place": "fixture",
                "menu": "fixture",
                "nutrition": "fixture",
                "price": "fixture",
                "walk": "fixture",
                "observedAt": "2026-10-09",
            },
        )
        result.append(
            {
                "candidateId": m["candidateId"],
                "qlooEntityId": m.get("qlooEntityId"),
                "rank": i + 1,
                "placeName": m["placeName"],
                "menuName": m["menuName"],
                "price": m["price"],
                "currency": m.get("currency", "JPY"),
                "walkMinutes": m["walkMinutes"],
                "tasteFit": (
                    ("high" if taste >= 0.7 else "medium" if taste >= 0.4 else "low")
                    if source != "unavailable"
                    else "unavailable"
                ),
                "nutritionContribution": {k: m.get(k) for k in NUTRIENTS},
                "allergenStatus": m["allergenStatus"],
                "allergens": m["allergens"],
                "reason": [
                    (
                        f"Qloo affinity: {taste:.3f}"
                        if source == "qloo"
                        else (
                            f"Fixture taste rank: {taste_rank}"
                            if source == "fixture"
                            else "No taste signal used"
                        )
                    ),
                    (
                        f"Nutrition fit: {detail['score']:.3f}"
                        if detail
                        else "Nutrition data may be incomplete"
                    ),
                ],
                "scores": {
                    "total": round(score, 6),
                    "nutrition": detail,
                    "taste": taste if source != "unavailable" else None,
                    "convenience": round(convenience, 6),
                    "weights": {
                        "nutrition": effective_weights[0],
                        "taste": effective_weights[1],
                        "convenience": effective_weights[2],
                    },
                },
                "tasteExplainability": (
                    signal.explainability if source == "qloo" else None
                ),
                "sourceReferences": {
                    key: m[key]
                    for key in [
                        "menuSource",
                        "nutritionSource",
                        "allergenSource",
                        "priceSource",
                        "walkSource",
                    ]
                    if key in m
                },
                "provenance": {**provenance, "taste": source},
            }
        )
    return result
