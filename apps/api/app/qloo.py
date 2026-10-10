import asyncio
import math
import os
import time
from collections import deque
from dataclasses import dataclass
from urllib.parse import urlparse
from uuid import UUID

import httpx

_REQUEST_TIMES: deque[float] = deque()


def reserve_request():
    try:
        limit = int(os.getenv("QLOO_REQUESTS_PER_MINUTE", "60"))
    except ValueError:
        raise QlooError("QLOO_CONFIG_INVALID") from None
    if not 1 <= limit <= 1000:
        raise QlooError("QLOO_CONFIG_INVALID")
    now = time.monotonic()
    while _REQUEST_TIMES and now - _REQUEST_TIMES[0] >= 60:
        _REQUEST_TIMES.popleft()
    if len(_REQUEST_TIMES) >= limit:
        raise QlooError("QLOO_RATE_LIMITED")
    _REQUEST_TIMES.append(now)


class QlooError(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


@dataclass(frozen=True)
class PlaceAffinity:
    entity_id: str
    name: str
    affinity: float
    properties: dict
    explainability: dict


def entity_id(value: str) -> str:
    return str(UUID(value)).lower()


class FixtureTasteProvider:
    async def rank_places(self, *, cuisines: list[str], ambience: list[str], city: str):
        from .catalog import CATALOG

        return {m["candidateId"]: m["fixtureTasteOrder"] for m in CATALOG}


class LiveQlooProvider:
    def __init__(self, *, api_key: str | None = None, transport=None):
        self.api_key = api_key if api_key is not None else os.getenv("QLOO_API_KEY", "")
        self.base_url = os.getenv("QLOO_BASE_URL", "https://api.qloo.com").rstrip("/")
        url = urlparse(self.base_url)
        if (
            url.scheme != "https"
            or url.hostname not in {"api.qloo.com", "hackathon.api.qloo.com"}
            or url.username
            or url.password
            or url.port not in {None, 443}
            or url.path
            or url.query
            or url.fragment
        ):
            raise QlooError("QLOO_CONFIG_INVALID")
        self.transport = transport

    async def _get(self, path: str, params: dict) -> dict:
        if not self.api_key:
            raise QlooError("QLOO_NOT_CONFIGURED")
        try:
            async with asyncio.timeout(10):
                async with httpx.AsyncClient(
                    base_url=self.base_url,
                    timeout=4,
                    headers={"X-Api-Key": self.api_key},
                    transport=self.transport,
                    follow_redirects=False,
                ) as client:
                    for attempt in range(2):
                        try:
                            reserve_request()
                            response = await client.get(path, params=params)
                        except httpx.TransportError:
                            if attempt == 0:
                                await asyncio.sleep(0.1)
                                continue
                            raise QlooError("QLOO_UNAVAILABLE") from None
                        if response.status_code in {401, 403}:
                            raise QlooError("QLOO_AUTH_FAILED")
                        if response.status_code == 429 or response.status_code >= 500:
                            if attempt == 0:
                                await asyncio.sleep(0.1)
                                continue
                            raise QlooError(
                                "QLOO_RATE_LIMITED"
                                if response.status_code == 429
                                else "QLOO_UNAVAILABLE"
                            )
                        if response.status_code != 200:
                            raise QlooError("QLOO_REQUEST_REJECTED")
                        try:
                            payload = response.json()
                        except ValueError:
                            raise QlooError("QLOO_INVALID_RESPONSE") from None
                        if (
                            not isinstance(payload, dict)
                            or payload.get("success") is not True
                            or not isinstance(payload.get("results"), dict)
                        ):
                            raise QlooError("QLOO_INVALID_RESPONSE")
                        return payload["results"]
        except TimeoutError:
            raise QlooError("QLOO_UNAVAILABLE") from None
        raise QlooError("QLOO_UNAVAILABLE")

    async def places(
        self,
        *,
        city: str,
        lat: float | None = None,
        lng: float | None = None,
        radius_m: int = 2000,
        entity_ids: list[str] | None = None,
        tag_ids: list[str] | None = None,
        candidate_ids: list[str] | None = None,
        limit: int = 20,
    ) -> list[PlaceAffinity]:
        params = {
            "filter.type": "urn:entity:place",
            "take": limit,
            "filter.tags": "urn:tag:genre:place:restaurant",
            "feature.explainability": "true",
            "sort_by": "affinity",
        }
        if lat is not None and lng is not None:
            params.update(
                {"filter.location": f"{lat},{lng}", "filter.location.radius": radius_m}
            )
        else:
            params.update({"filter.location.query": city, "filter.location.radius": 0})
        if entity_ids:
            params["signal.interests.entities"] = ",".join(
                entity_id(value) for value in entity_ids
            )
        if tag_ids:
            params["signal.interests.tags"] = ",".join(tag_ids)
            params["operator.signal.interests.tags"] = "union"
        if candidate_ids:
            params["filter.results.entities"] = ",".join(
                entity_id(value) for value in candidate_ids
            )
        results = await self._get("/v2/insights", params)
        entities = results.get("entities")
        if not isinstance(entities, list):
            raise QlooError("QLOO_INVALID_RESPONSE")
        places = {}
        for item in entities:
            try:
                identifier = entity_id(item["entity_id"])
                query = item["query"]
                affinity = query["affinity"]
                if (
                    isinstance(affinity, bool)
                    or not isinstance(affinity, (int, float))
                    or not math.isfinite(affinity)
                    or not 0 <= affinity <= 1
                ):
                    continue
                name = item["name"]
                if not isinstance(name, str) or not name:
                    continue
                properties = item.get("properties", {})
                explanation = query.get("explainability", {})
                place = PlaceAffinity(
                    identifier,
                    name,
                    float(affinity),
                    properties if isinstance(properties, dict) else {},
                    explanation if isinstance(explanation, dict) else {},
                )
                if identifier not in places or affinity > places[identifier].affinity:
                    places[identifier] = place
            except (KeyError, TypeError, ValueError, AttributeError):
                continue
        if entities and not places:
            raise QlooError("QLOO_INVALID_RESPONSE")
        return sorted(
            places.values(), key=lambda place: (-place.affinity, place.entity_id)
        )

    async def tags(self, query: str) -> list[dict]:
        results = await self._get("/v2/tags", {"filter.query": query, "take": 20})
        tags = results.get("tags")
        if not isinstance(tags, list):
            raise QlooError("QLOO_INVALID_RESPONSE")
        return [
            {"tagId": item["tag_id"], "name": item.get("name", item["tag_id"])}
            for item in tags
            if isinstance(item, dict)
            and isinstance(item.get("tag_id"), str)
            and item["tag_id"].startswith("urn:tag:")
        ]
