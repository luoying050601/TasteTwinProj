from .models import DailySummary

FIELDS = [("protein", "proteinG", "targetProteinG", "g"),
          ("fiber", "fiberG", "targetFiberG", "g"),
          ("fat", "fatG", "targetFatG", "g"),
          ("fluid", "fluidMl", "targetFluidMl", "ml")]

def calculate_gap(summary: DailySummary | None):
    available = []
    if summary:
        for nutrient, actual_key, target_key, unit in FIELDS:
            actual, target = getattr(summary, actual_key), getattr(summary, target_key)
            if actual is None or target is None or target <= 0:
                continue
            coverage = actual / target
            available.append({"nutrient": nutrient, "missingAmount": round(max(target-actual, 0), 2),
                "unit": unit, "coverage": coverage,
                "level": "low_attention" if coverage >= .9 else "medium_gap" if coverage >= .7 else "high_gap",
                "sourceType": summary.sourceType})
    if not available:
        return {"nutrient": "none", "missingAmount": 0, "unit": "g", "level": "unavailable", "sourceType": "unavailable"}
    primary = min(available, key=lambda x: x["coverage"])
    if primary["coverage"] >= .9:
        return {**primary, "nutrient": "none", "missingAmount": 0}
    return primary
