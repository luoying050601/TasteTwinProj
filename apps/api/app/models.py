from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator

Allergen = Literal[
    "peanut", "milk", "egg", "soy", "wheat", "fish", "shellfish", "sesame"
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Location(StrictModel):
    city: str = Field(default="", max_length=80)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def paired_coordinates(self):
        if (self.lat is None) != (self.lng is None):
            raise ValueError("lat and lng must be provided together")
        return self


class DailySummary(StrictModel):
    proteinG: float | None = Field(default=None, ge=0)
    targetProteinG: float | None = Field(default=None, gt=0)
    fiberG: float | None = Field(default=None, ge=0)
    targetFiberG: float | None = Field(default=None, gt=0)
    fatG: float | None = Field(default=None, ge=0)
    targetFatG: float | None = Field(default=None, gt=0)
    fluidMl: float | None = Field(default=None, ge=0)
    targetFluidMl: float | None = Field(default=None, gt=0)
    caloriesKcal: float | None = Field(default=None, ge=0, le=50000)
    targetCaloriesKcal: float | None = Field(default=None, gt=0, le=10000)
    sodiumMg: float | None = Field(default=None, ge=0, le=100000)
    maxSodiumMg: float | None = Field(default=None, gt=0, le=10000)
    sourceType: Literal["fixture", "manual"] = "manual"


class PersonalProfile(StrictModel):
    age: int = Field(ge=18, le=100)
    weightKg: float | None = Field(default=None, ge=30, le=300)
    heightCm: float | None = Field(default=None, ge=120, le=230)
    metabolicSex: Literal["female", "male"] | None = None
    activity: Literal["sedentary", "light", "moderate", "high"] = "sedentary"
    goal: Literal["balanced", "protein_focus"] = "balanced"
    healthContext: Literal["general", "clinical", "pregnancy"] = "general"
    mealFraction: float = Field(default=0.35, ge=0.2, le=0.5)
    allergens: list[Allergen] = Field(default_factory=list, max_length=20)


class MealIntake(StrictModel):
    mealId: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=100)
    proteinG: float | None = Field(default=None, ge=0, le=1000)
    fiberG: float | None = Field(default=None, ge=0, le=1000)
    fatG: float | None = Field(default=None, ge=0, le=1000)
    fluidMl: float | None = Field(default=None, ge=0, le=20000)
    caloriesKcal: float | None = Field(default=None, ge=0, le=10000)
    sodiumMg: float | None = Field(default=None, ge=0, le=50000)


class TasteProfile(StrictModel):
    likedEntityIds: list[UUID] = Field(default_factory=list, max_length=20)
    likedTagIds: list[str] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def valid_tags(self):
        import re

        if any(
            not re.fullmatch(r"urn:tag:[A-Za-z0-9_:.-]{1,180}", tag)
            for tag in self.likedTagIds
        ):
            raise ValueError("Use verified Qloo tag IDs")
        return self


class PlacesRequest(StrictModel):
    location: Location
    tasteProfile: TasteProfile = Field(default_factory=TasteProfile)
    radiusMeters: int = Field(default=2000, ge=100, le=20000)
    limit: int = Field(default=10, ge=1, le=50)

    @model_validator(mode="after")
    def location_required(self):
        if not self.location.city.strip() and self.location.lat is None:
            raise ValueError("Provide a city or coordinates")
        return self


class Constraints(StrictModel):
    cuisines: list[str] = Field(default_factory=list, max_length=10)
    ambience: list[str] = Field(default_factory=list, max_length=10)
    partySize: int | None = Field(default=None, ge=1, le=20)
    budgetMax: float | None = Field(default=None, gt=0)
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")
    maxWalkMinutes: int | None = Field(default=None, ge=1, le=60)
    allergens: list[Allergen] = Field(default_factory=list, max_length=20)
    excludeSpicy: bool = False


class InterpretRequest(StrictModel):
    sessionId: UUID
    message: str = Field(min_length=1, max_length=500)
    locale: Literal["zh-CN", "en-US", "ja-JP"] = "en-US"
    location: Location = Field(default_factory=Location)
    dailySummary: DailySummary | None = None
    allergens: list[Allergen] = Field(default_factory=list, max_length=20)
    personalProfile: PersonalProfile | None = None
    consumedMeals: list[MealIntake] | None = Field(default=None, max_length=30)
    tasteProfile: TasteProfile = Field(default_factory=TasteProfile)

    @model_validator(mode="after")
    def unique_meals(self):
        if self.consumedMeals is not None:
            identifiers = [meal.mealId for meal in self.consumedMeals]
            if len(identifiers) != len(set(identifiers)):
                raise ValueError("Duplicate meal IDs")
            if self.dailySummary is not None and any(
                getattr(self.dailySummary, key) is not None
                for key in [
                    "proteinG",
                    "fiberG",
                    "fatG",
                    "fluidMl",
                    "caloriesKcal",
                    "sodiumMg",
                ]
            ):
                raise ValueError(
                    "Provide consumedMeals OR dailySummary intake, not both"
                )
        return self


class RecommendRequest(StrictModel):
    sessionId: UUID
    qlooEnabled: bool = True
    limit: int = Field(default=3, ge=1, le=3)


class RefineRequest(StrictModel):
    sessionId: UUID
    refinement: str = Field(min_length=1, max_length=200)


class SelectRequest(StrictModel):
    sessionId: UUID
    candidateId: str = Field(min_length=1, max_length=100)
