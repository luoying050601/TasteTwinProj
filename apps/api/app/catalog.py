# All places, menus, nutrients, prices, walking times, and taste order below are synthetic.
# This catalog does not represent real restaurants and must never be relabeled live.
CATALOG = [
    {
        "candidateId": "demo-sora",
        "placeName": "Sora 食堂 · 虚构",
        "menuName": "烤鱼与蔬菜定食",
        "price": 980,
        "walkMinutes": 12,
        "proteinG": 27,
        "fiberG": 6,
        "fatG": 12,
        "allergens": ["fish", "soy", "wheat"],
        "allergenStatus": "known",
        "spicy": False,
        "cuisine": "Japanese",
        "ambience": ["quiet"],
        "fixtureTasteOrder": 1,
    },
    {
        "candidateId": "demo-mori",
        "placeName": "Mori Kitchen · 虚构",
        "menuName": "豆腐杂粮蔬菜碗",
        "price": 850,
        "walkMinutes": 8,
        "proteinG": 23,
        "fiberG": 8,
        "fatG": 9,
        "allergens": ["soy", "sesame"],
        "allergenStatus": "known",
        "spicy": False,
        "cuisine": "Japanese",
        "ambience": ["quiet"],
        "fixtureTasteOrder": 3,
    },
    {
        "candidateId": "demo-hana",
        "placeName": "Hana Bento · 虚构",
        "menuName": "鸡肉蔬菜便当",
        "price": 780,
        "walkMinutes": 6,
        "proteinG": 25,
        "fiberG": 5,
        "fatG": 11,
        "allergens": ["soy", "wheat"],
        "allergenStatus": "known",
        "spicy": False,
        "cuisine": "Japanese",
        "ambience": ["quiet"],
        "fixtureTasteOrder": 2,
    },
    {
        "candidateId": "demo-aki",
        "placeName": "Aki Curry · 虚构",
        "menuName": "花生酱咖喱饭",
        "price": 700,
        "walkMinutes": 4,
        "proteinG": 22,
        "fiberG": 4,
        "fatG": 18,
        "allergens": ["peanut", "milk"],
        "allergenStatus": "known",
        "spicy": True,
        "cuisine": "Japanese",
        "ambience": [],
        "fixtureTasteOrder": 4,
    },
    {
        "candidateId": "demo-unknown",
        "placeName": "Kumo Cafe · 虚构",
        "menuName": "今日套餐（成分未核实）",
        "price": 900,
        "walkMinutes": 9,
        "proteinG": None,
        "fiberG": None,
        "fatG": None,
        "allergens": [],
        "allergenStatus": "unknown",
        "spicy": False,
        "cuisine": "Japanese",
        "ambience": ["quiet"],
        "fixtureTasteOrder": 5,
    },
]

import json
import os
from datetime import date
from pathlib import Path
from uuid import UUID

from pydantic import Field, HttpUrl, TypeAdapter, model_validator
from typing import Literal
from .models import Allergen, StrictModel


class CatalogError(Exception):
    pass


class MenuCandidate(StrictModel):
    candidateId: str = Field(min_length=1, max_length=100)
    qlooEntityId: UUID
    placeName: str = Field(min_length=1, max_length=150)
    menuName: str = Field(min_length=1, max_length=150)
    city: str = Field(min_length=1, max_length=80)
    price: float = Field(ge=0, le=100000)
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    walkMinutes: int | None = Field(default=None, ge=0, le=180)
    walkOriginLat: float | None = Field(default=None, ge=-90, le=90)
    walkOriginLng: float | None = Field(default=None, ge=-180, le=180)
    proteinG: float | None = Field(default=None, ge=0, le=1000)
    fiberG: float | None = Field(default=None, ge=0, le=1000)
    fatG: float | None = Field(default=None, ge=0, le=1000)
    caloriesKcal: float | None = Field(default=None, ge=0, le=10000)
    sodiumMg: float | None = Field(default=None, ge=0, le=50000)
    fluidMl: float | None = Field(default=None, ge=0, le=20000)
    allergens: list[Allergen] = Field(default_factory=list)
    allergenStatus: Literal["known", "unknown"] = "unknown"
    spicy: bool | None = None
    cuisine: str = Field(min_length=1, max_length=80)
    ambience: list[str] = Field(default_factory=list, max_length=10)
    observedAt: date
    menuSource: HttpUrl
    nutritionSource: HttpUrl | None = None
    allergenSource: HttpUrl | None = None
    priceSource: HttpUrl
    walkSource: HttpUrl | None = None

    @model_validator(mode="after")
    def require_sources(self):
        if self.candidateId.startswith("demo-"):
            raise ValueError("Do not relabel fixture menus")
        if self.observedAt > date.today():
            raise ValueError("Observation date cannot be in the future")
        if (
            any(
                getattr(self, key) is not None
                for key in [
                    "proteinG",
                    "fiberG",
                    "fatG",
                    "caloriesKcal",
                    "sodiumMg",
                    "fluidMl",
                ]
            )
            and self.nutritionSource is None
        ):
            raise ValueError("Nutrition requires a source")
        if self.allergenStatus == "known" and self.allergenSource is None:
            raise ValueError("Known allergens require a source")
        if self.walkMinutes is not None and (
            self.walkOriginLat is None
            or self.walkOriginLng is None
            or self.walkSource is None
        ):
            raise ValueError("Walking time requires a route origin and source")
        return self


def load_menu_catalog(location: dict) -> list[dict]:
    path = os.getenv("MENU_CATALOG_PATH")
    if not path:
        return []
    try:
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
        menus = TypeAdapter(list[MenuCandidate]).validate_python(payload)
        if len(menus) > 500 or len({menu.candidateId for menu in menus}) != len(menus):
            raise ValueError("Catalog size or duplicate IDs")
    except (OSError, ValueError):
        raise CatalogError("MENU_CATALOG_INVALID") from None
    result = []
    for menu in menus:
        if menu.city.casefold().strip() != location["city"].casefold().strip():
            continue
        item = menu.model_dump(mode="json")
        if (
            location.get("lat") is None
            or location.get("lng") is None
            or menu.walkOriginLat is None
            or menu.walkOriginLng is None
            or abs(location["lat"] - menu.walkOriginLat) > 0.0001
            or abs(location["lng"] - menu.walkOriginLng) > 0.0001
        ):
            item["walkMinutes"] = None
        item["provenance"] = {
            "place": "catalog",
            "menu": "catalog",
            "price": "catalog",
            "nutrition": "catalog" if menu.nutritionSource else "unavailable",
            "walk": "catalog" if item["walkMinutes"] is not None else "unavailable",
            "allergens": "catalog" if menu.allergenSource else "unavailable",
            "observedAt": item["observedAt"],
        }
        result.append(item)
    return result
