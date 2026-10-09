from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator

Allergen = Literal["peanut", "milk", "egg", "soy", "wheat", "fish", "shellfish", "sesame"]

class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

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
    sourceType: Literal["fixture", "manual"] = "manual"

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
    locale: Literal["zh-CN", "en-US"] = "zh-CN"
    location: Location = Field(default_factory=Location)
    dailySummary: DailySummary | None = None
    allergens: list[Allergen] = Field(default_factory=list, max_length=20)

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
