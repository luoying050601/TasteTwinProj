from .models import DailySummary, MealIntake, PersonalProfile

FIELDS = [
    ("protein", "proteinG", "targetProteinG", "g"),
    ("fiber", "fiberG", "targetFiberG", "g"),
    ("fat", "fatG", "targetFatG", "g"),
    ("fluid", "fluidMl", "targetFluidMl", "ml"),
]


def calculate_gap(summary: DailySummary | None):
    available = []
    if summary:
        for nutrient, actual_key, target_key, unit in FIELDS:
            actual, target = getattr(summary, actual_key), getattr(summary, target_key)
            if actual is None or target is None or target <= 0:
                continue
            coverage = actual / target
            available.append(
                {
                    "nutrient": nutrient,
                    "missingAmount": round(max(target - actual, 0), 2),
                    "unit": unit,
                    "coverage": coverage,
                    "level": (
                        "low_attention"
                        if coverage >= 0.9
                        else "medium_gap" if coverage >= 0.7 else "high_gap"
                    ),
                    "sourceType": summary.sourceType,
                }
            )
    if not available:
        return {
            "nutrient": "none",
            "missingAmount": 0,
            "unit": "g",
            "level": "unavailable",
            "sourceType": "unavailable",
        }
    primary = min(available, key=lambda x: x["coverage"])
    if primary["coverage"] >= 0.9:
        return {**primary, "nutrient": "none", "missingAmount": 0}
    return primary


NUTRIENTS = {
    "proteinG": "targetProteinG",
    "fiberG": "targetFiberG",
    "fatG": "targetFatG",
    "fluidMl": "targetFluidMl",
    "caloriesKcal": "targetCaloriesKcal",
    "sodiumMg": "maxSodiumMg",
}
ACTIVITY = {"sedentary": 1.2, "light": 1.375, "moderate": 1.55, "high": 1.725}


def assess_nutrition(
    summary: DailySummary | None,
    profile: PersonalProfile | None,
    meals: list[MealIntake] | None,
):
    daily = summary.model_copy(deep=True) if summary else DailySummary()
    warnings = ["GENERAL_WELLNESS_NOT_MEDICAL_ADVICE"]
    sources = {
        key: "provided"
        for key, target in NUTRIENTS.items()
        if getattr(daily, target) is not None
    }
    if meals is not None:
        for key in NUTRIENTS:
            values = [getattr(meal, key) for meal in meals]
            actual = (
                round(sum(values), 2)
                if all(value is not None for value in values)
                else None
            )
            setattr(daily, key, actual)
            if actual is None:
                warnings.append("INCOMPLETE_INTAKE_" + key)
        daily.sourceType = "manual"
    if profile and profile.healthContext != "general":
        warnings.append("PROFESSIONAL_TARGETS_REQUIRED")
    elif profile:
        if (
            daily.targetCaloriesKcal is None
            and profile.weightKg is not None
            and profile.heightCm is not None
            and profile.metabolicSex is not None
        ):
            resting = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age
            resting += 5 if profile.metabolicSex == "male" else -161
            estimated_energy = round(resting * ACTIVITY[profile.activity])
            if 1200 <= estimated_energy <= 5000:
                daily.targetCaloriesKcal = estimated_energy
                sources["caloriesKcal"] = "estimated_mifflin_st_jeor"
            else:
                warnings.append("ENERGY_ESTIMATE_REQUIRES_REVIEW")
        if daily.targetProteinG is None and profile.weightKg is not None:
            multiplier = (
                1.2
                if profile.goal == "protein_focus"
                or profile.activity in {"moderate", "high"}
                else 0.8
            )
            daily.targetProteinG = round(profile.weightKg * multiplier, 1)
            sources["proteinG"] = "estimated_adult_reference"
        if daily.targetFiberG is None and daily.targetCaloriesKcal is not None:
            daily.targetFiberG = round(daily.targetCaloriesKcal / 1000 * 14, 1)
            sources["fiberG"] = "estimated_adult_reference"
        if daily.maxSodiumMg is None:
            daily.maxSodiumMg = 2300
            sources["sodiumMg"] = "adult_general_limit"
        if any(source.startswith("estimated") for source in sources.values()):
            warnings.append("TARGETS_ARE_ESTIMATES")
    fraction = profile.mealFraction if profile else 0.35
    targets, remaining, meal_targets = {}, {}, {}
    for key, target_key in NUTRIENTS.items():
        target, actual = getattr(daily, target_key), getattr(daily, key)
        targets[key] = target
        remaining[key] = (
            round(max(target - actual, 0), 2)
            if target is not None and actual is not None
            else None
        )
        meal_targets[key] = (
            round(min(target * fraction, remaining[key]), 2)
            if remaining[key] is not None
            else None
        )
    return daily, {
        "intake": {key: getattr(daily, key) for key in NUTRIENTS},
        "dailyTargets": targets,
        "remaining": remaining,
        "mealTargets": meal_targets,
        "targetSources": sources,
        "mealFraction": fraction,
        "warnings": warnings,
        "intakeSource": daily.sourceType,
    }


def score_nutrition(meal: dict, assessment: dict) -> dict:
    components = {}
    for key in ["proteinG", "fiberG", "caloriesKcal"]:
        target = assessment["mealTargets"].get(key)
        value = meal.get(key)
        if target is not None and target > 0:
            components[key] = (
                (
                    min(value / target, 1)
                    if key != "caloriesKcal"
                    else max(0, 1 - abs(value - target) / target)
                )
                if value is not None
                else 0
            )
    penalties = {}
    for key in ["caloriesKcal", "fatG", "sodiumMg"]:
        value, remaining = meal.get(key), assessment["remaining"].get(key)
        target = assessment["dailyTargets"].get(key)
        if value is not None and remaining is not None and target:
            penalties[key] = min(max(value - remaining, 0) / target, 1)
    benefit = sum(components.values()) / len(components) if components else 0
    penalty = min(sum(penalties.values()), 1)
    return {
        "score": round(max(0, benefit - penalty), 6),
        "benefits": components,
        "excessPenalties": penalties,
        "coverage": {key: meal.get(key) is not None for key in components},
        "missingNutrients": [
            key
            for key in assessment["dailyTargets"]
            if assessment["dailyTargets"][key] is not None and meal.get(key) is None
        ],
        "available": bool(components)
        or any(
            assessment["remaining"].get(key) is not None
            and assessment["dailyTargets"].get(key)
            for key in ["caloriesKcal", "fatG", "sodiumMg"]
        ),
    }
