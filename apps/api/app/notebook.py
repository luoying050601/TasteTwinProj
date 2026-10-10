import os
from datetime import datetime
from typing import Literal
from uuid import UUID, uuid4

import httpx
from pydantic import ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel

from .models import StrictModel


class NotebookError(Exception):
    def __init__(self, code="NOTEBOOK_UNAVAILABLE", status=503, retryable=True):
        self.code, self.status, self.retryable = code, status, retryable
        super().__init__(code)


class CollectionModel(StrictModel):
    model_config = ConfigDict(
        extra="forbid",
        allow_inf_nan=False,
        alias_generator=to_camel,
        populate_by_name=True,
    )


CollectionAllergen = Literal[
    "milk",
    "egg",
    "peanut",
    "tree_nut",
    "fish",
    "crustacean",
    "sesame",
    "wheat",
    "soy",
    "mango",
    "other",
]
AvoidedFood = Literal[
    "cilantro",
    "scallion",
    "ginger",
    "garlic",
    "pork",
    "beef",
    "lamb",
    "offal_blood",
    "fish_seafood",
    "alcohol",
    "other",
]
SelectionStatus = Literal["unknown", "none", "selected"]
MealHabit = Literal["often", "sometimes", "never"]


class DietaryPreferences(CollectionModel):
    city: str = Field(default="", max_length=80)
    allergy_status: SelectionStatus = "unknown"
    allergens: list[CollectionAllergen] = Field(default_factory=list, max_length=11)
    allergy_other: str = Field(default="", max_length=200)
    avoidance_status: SelectionStatus = "unknown"
    avoided_foods: list[AvoidedFood] = Field(default_factory=list, max_length=11)
    avoidance_other: str = Field(default="", max_length=200)

    @field_validator("city", "allergy_other", "avoidance_other", mode="before")
    @classmethod
    def trim_other(cls, value):
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def consistent_selections(self):
        for status, values, other in [
            (self.allergy_status, self.allergens, self.allergy_other),
            (self.avoidance_status, self.avoided_foods, self.avoidance_other),
        ]:
            if len(set(values)) != len(values):
                raise ValueError("Duplicate choices")
            if (status == "selected") != bool(values):
                raise ValueError("Status must match choices")
            if ("other" in values) != bool(other):
                raise ValueError("Other requires a description")
        return self


class HealthSnapshot(CollectionModel):
    weight_kg: float = Field(strict=True, gt=0, le=500)
    height_cm: float = Field(strict=True, ge=30, le=300)
    body_fat_status: Literal["unknown", "measured"]
    body_fat_pct: float | None = Field(default=None, strict=True, gt=0, lt=100)
    goal: Literal["build_muscle", "lose_fat", "wellness", "no_specific_goal"]
    chronotype: Literal["morning", "evening", "intermediate"]
    breakfast_habit: MealHabit
    lunch_habit: MealHabit
    dinner_habit: MealHabit

    @field_validator("weight_kg", "height_cm", "body_fat_pct")
    @classmethod
    def two_decimals(cls, value):
        return round(value, 2) if value is not None else None

    @model_validator(mode="after")
    def measured_body_fat(self):
        if (self.body_fat_status == "measured") != (self.body_fat_pct is not None):
            raise ValueError("Body fat status must match measurement")
        if self.weight_kg <= 0 or (
            self.body_fat_pct is not None and not 0 < self.body_fat_pct < 100
        ):
            raise ValueError("Rounded measurement outside limits")
        return self


class HealthCreate(HealthSnapshot):
    id: UUID = Field(default_factory=uuid4)


class HealthRecord(HealthSnapshot):
    id: UUID
    recorded_at: datetime

    def public(self):
        return {
            **self.model_dump(mode="json", by_alias=True),
            "bmi": round(self.weight_kg / (self.height_cm / 100) ** 2, 1),
        }


class NotebookStore:
    def __init__(self, url=None, key=None, transport=None):
        self.url = (url or os.getenv("SUPABASE_URL", "")).rstrip("/")
        self.key = key or os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
        self.transport = transport

    async def call(self, account, method, table, params=None, body=None):
        if not self.url or not self.key:
            raise NotebookError("AUTH_NOT_CONFIGURED", retryable=False)
        try:
            async with httpx.AsyncClient(
                timeout=10, transport=self.transport
            ) as client:
                response = await client.request(
                    method,
                    self.url + "/rest/v1/" + table,
                    headers={
                        "apikey": self.key,
                        "Authorization": "Bearer " + account.token,
                        "Prefer": "return=representation",
                    },
                    params=params,
                    **({"json": body} if body is not None else {})
                )
            if response.status_code == 401:
                raise NotebookError("AUTH_REQUIRED", 401, False)
            if response.status_code == 409:
                raise NotebookError("NOTEBOOK_CONFLICT", 409, False)
            if not response.is_success:
                raise NotebookError()
            rows = response.json()
            if not isinstance(rows, list):
                raise NotebookError()
            return rows
        except (httpx.HTTPError, ValueError):
            raise NotebookError() from None

    async def dietary(self, account):
        rows = await self.call(
            account,
            "GET",
            "user_dietary_preferences",
            {
                "user_id": "eq." + account.id,
                "select": ",".join(DietaryPreferences.model_fields),
            },
        )
        if len(rows) > 1:
            raise NotebookError()
        try:
            return (
                DietaryPreferences.model_validate(rows[0])
                if rows
                else DietaryPreferences()
            )
        except ValueError:
            raise NotebookError() from None

    async def save_dietary(self, account, body):
        fields = ",".join(DietaryPreferences.model_fields)
        existing = await self.call(
            account,
            "GET",
            "user_dietary_preferences",
            {"user_id": "eq." + account.id, "select": "user_id"},
        )
        method = "PATCH" if existing else "POST"
        payload = body.model_dump(
            exclude={"city"} if "city" not in body.model_fields_set else set()
        )
        if not existing:
            payload["user_id"] = account.id
        rows = await self.call(
            account,
            method,
            "user_dietary_preferences",
            {"user_id": "eq." + account.id, "select": fields},
            payload,
        )
        if len(rows) != 1:
            raise NotebookError()
        try:
            return DietaryPreferences.model_validate(rows[0])
        except ValueError:
            raise NotebookError() from None

    async def history(self, account, offset=0, limit=20):
        rows = await self.call(
            account,
            "GET",
            "user_health_records",
            {
                "user_id": "eq." + account.id,
                "select": ",".join(HealthRecord.model_fields),
                "order": "recorded_at.desc,id.desc",
                "offset": offset,
                "limit": limit + 1,
            },
        )
        try:
            records = [
                HealthRecord.model_validate(row).public() for row in rows[:limit]
            ]
        except ValueError:
            raise NotebookError() from None
        return {
            "records": records,
            "nextOffset": offset + limit if len(rows) > limit else None,
        }

    async def add_health(self, account, body):
        params = {
            "user_id": "eq." + account.id,
            "id": "eq." + str(body.id),
            "select": ",".join(HealthRecord.model_fields),
        }
        existing = await self.call(account, "GET", "user_health_records", params)
        if existing:
            try:
                original = HealthRecord.model_validate(existing[0])
                if original.model_dump(exclude={"recorded_at"}) != body.model_dump():
                    raise NotebookError("NOTEBOOK_CONFLICT", 409, False)
                return original.public()
            except ValueError:
                raise NotebookError() from None
        rows = await self.call(
            account,
            "POST",
            "user_health_records",
            {"select": ",".join(HealthRecord.model_fields)},
            {**body.model_dump(mode="json"), "user_id": account.id},
        )
        if len(rows) != 1:
            raise NotebookError()
        try:
            return HealthRecord.model_validate(rows[0]).public()
        except ValueError:
            raise NotebookError() from None


def notebook_store():
    return NotebookStore()
