from copy import deepcopy
from .catalog import CATALOG

WEIGHTS = {"with_taste": (.45, .35, .20), "baseline": (.70, 0, .30)}

def eligible(constraints):
    result = []
    for item in CATALOG:
        if set(item["allergens"]) & set(constraints["allergens"]): continue
        # Unknown ingredient lists cannot pass an active allergy restriction.
        if constraints["allergens"] and item["allergenStatus"] != "known": continue
        if constraints["excludeSpicy"] and item["spicy"]: continue
        if constraints["currency"] not in [None, "JPY"]: continue
        if constraints["budgetMax"] is not None and item["price"] > constraints["budgetMax"]: continue
        if constraints["maxWalkMinutes"] and item["walkMinutes"] > constraints["maxWalkMinutes"]: continue
        if constraints["cuisines"] and item["cuisine"] not in constraints["cuisines"]: continue
        if any(a not in item["ambience"] for a in constraints["ambience"]): continue
        result.append(deepcopy(item))
    return result

def rank(candidates, gap, taste_order, enabled, limit):
    weights = WEIGHTS["with_taste" if enabled else "baseline"]
    scored = []
    for m in candidates:
        nutrient_key = {"protein":"proteinG", "fiber":"fiberG", "fat":"fatG"}.get(gap["nutrient"])
        value = m.get(nutrient_key) if nutrient_key else None
        nutrition = min(value/gap["missingAmount"], 1) if value is not None and gap["missingAmount"] > 0 else 0
        taste_rank = taste_order.get(m["candidateId"])
        taste = max(0, 1-(taste_rank-1)/max(len(taste_order)-1, 1)) if taste_rank else 0
        convenience = .5 * max(0, 1-m["walkMinutes"]/60) + .5 * max(0, 1-m["price"]/2000)
        score = weights[0]*nutrition + weights[1]*taste + weights[2]*convenience
        scored.append((score, m, taste_rank))
    scored.sort(key=lambda x: (-x[0], x[1]["walkMinutes"], x[1]["price"], x[1]["candidateId"]))
    result = []
    for i, (_, m, taste_rank) in enumerate(scored[:limit]):
        result.append({"candidateId":m["candidateId"], "qlooEntityId":None, "rank":i+1,
            "placeName":m["placeName"], "menuName":m["menuName"], "price":m["price"], "currency":"JPY",
            "walkMinutes":m["walkMinutes"], "tasteFit":("high" if taste_rank == 1 else "medium" if taste_rank and taste_rank <= 3 else "low") if enabled else "unavailable",
            "nutritionContribution":{k:m[k] for k in ["proteinG","fiberG","fatG"]},
            "allergenStatus":m["allergenStatus"], "allergens":m["allergens"],
            "reason":[f"演示口味序号 {taste_rank}（非真实 Qloo）" if enabled else "按营养、距离和价格排序，未使用口味信号",
                f"演示餐食含 {m[nutrient_key]:g} g {gap['nutrient']}" if nutrient_key and m[nutrient_key] is not None else "当前营养匹配值不可用"],
            "provenance":{"place":"fixture", "menu":"fixture", "nutrition":"fixture", "price":"fixture", "walk":"fixture", "taste":"fixture" if enabled else "unavailable", "observedAt":"2026-10-09"}})
    return result
