import asyncio
from uuid import UUID, uuid4

import httpx
import pytest

from app.qloo import LiveQlooProvider, QlooError

ENTITY = "636E1B95-6232-43E1-BDFE-37CD209C2CE3"
TAG = "urn:tag:genre:place:restaurant:japanese"


def test_records_and_no_match_after_refinement(monkeypatch):
    from app.qloo import PlaceAffinity

    client, sid, menus = live_context(monkeypatch)

    async def places(self, **kwargs):
        return [PlaceAffinity(menus[0]["qlooEntityId"], "Restaurant", 0.9, {}, {})]

    monkeypatch.setattr(LiveQlooProvider, "places", places)
    records = client.get("/api/sessions/" + sid)
    assert records.status_code == 200 and records.headers["Cache-Control"] == "no-store"
    assert records.json()["data"]["context"]["dailySummary"]["proteinG"] == 42
    client.post("/api/recommend", json={"sessionId": sid})
    result = client.post(
        "/api/refine", json={"sessionId": sid, "refinement": "closer"}
    ).json()["data"]
    assert not result["qlooUsed"] and result["dataMode"] == "baseline"
    assert result["comparison"]["withTaste"] == result["comparison"]["withoutTaste"]
    client.delete("/api/sessions/" + sid)
    assert client.get("/api/sessions/" + sid).status_code == 404


def test_upstream_request_budget(monkeypatch):
    from collections import deque
    import app.qloo as qloo

    monkeypatch.setattr(qloo, "_REQUEST_TIMES", deque())
    monkeypatch.setenv("QLOO_REQUESTS_PER_MINUTE", "1")
    provider = LiveQlooProvider(
        api_key="test-only",
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200, json={"success": True, "results": {"entities": []}}
            )
        ),
    )
    assert asyncio.run(provider.places(city="Tokyo")) == []
    with pytest.raises(QlooError, match="QLOO_RATE_LIMITED"):
        asyncio.run(provider.places(city="Tokyo"))


def test_insights_contract_and_normalization():
    def respond(request):
        assert request.url.path == "/v2/insights"
        assert request.headers["X-Api-Key"] == "test-only"
        params = dict(request.url.params)
        assert params["filter.type"] == "urn:entity:place"
        assert params["signal.interests.entities"] == ENTITY.lower()
        assert params["signal.interests.tags"] == TAG
        assert params["filter.location"] == "35.66,139.7"
        assert params["filter.results.entities"] == ENTITY.lower()
        assert not any(
            word in str(params)
            for word in ["protein", "allergen", "weightKg", "sessionId"]
        )
        return httpx.Response(
            200,
            json={
                "success": True,
                "results": {
                    "entities": [
                        {
                            "entity_id": ENTITY,
                            "name": "Real place",
                            "query": {
                                "affinity": 0.82,
                                "explainability": {"signal": 0.7},
                            },
                            "properties": {"address": "Tokyo"},
                        }
                    ]
                },
            },
        )

    provider = LiveQlooProvider(
        api_key="test-only", transport=httpx.MockTransport(respond)
    )
    places = asyncio.run(
        provider.places(
            city="Tokyo",
            lat=35.66,
            lng=139.7,
            entity_ids=[ENTITY],
            tag_ids=[TAG],
            candidate_ids=[ENTITY],
        )
    )
    assert places[0].entity_id == ENTITY.lower()
    assert places[0].affinity == 0.82
    assert places[0].explainability == {"signal": 0.7}


@pytest.mark.parametrize(
    "status,code,calls",
    [
        (401, "QLOO_AUTH_FAILED", 1),
        (403, "QLOO_AUTH_FAILED", 1),
        (429, "QLOO_RATE_LIMITED", 2),
        (503, "QLOO_UNAVAILABLE", 2),
        (400, "QLOO_REQUEST_REJECTED", 1),
    ],
)
def test_bounded_retry_and_sanitized_errors(status, code, calls):
    requests = []

    def respond(request):
        requests.append(request)
        return httpx.Response(status, text="secret upstream detail")

    provider = LiveQlooProvider(
        api_key="test-only", transport=httpx.MockTransport(respond)
    )
    with pytest.raises(QlooError) as error:
        asyncio.run(provider.places(city="Tokyo"))
    assert str(error.value) == code
    assert len(requests) == calls


def test_missing_key_and_invalid_response():
    with pytest.raises(QlooError, match="QLOO_NOT_CONFIGURED"):
        asyncio.run(LiveQlooProvider(api_key="").places(city="Tokyo"))
    provider = LiveQlooProvider(
        api_key="test-only",
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200,
                json={
                    "success": True,
                    "results": {
                        "entities": [
                            {
                                "entity_id": ENTITY,
                                "name": "Invalid",
                                "query": {"affinity": 8},
                            }
                        ]
                    },
                },
            )
        ),
    )
    with pytest.raises(QlooError, match="QLOO_INVALID_RESPONSE"):
        asyncio.run(provider.places(city="Tokyo"))


def test_discovery_endpoint_and_configuration_health(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.qloo import PlaceAffinity

    monkeypatch.setenv("QLOO_API_KEY", "test-only")

    async def places(self, **kwargs):
        assert kwargs["entity_ids"] == [ENTITY.lower()]
        return [PlaceAffinity(ENTITY.lower(), "Restaurant", 0.82, {}, {})]

    monkeypatch.setattr(LiveQlooProvider, "places", places)
    client = TestClient(app)
    assert client.get("/api/health").json()["data"]["qloo"] == "configured_not_verified"
    response = client.post(
        "/api/places",
        json={
            "location": {"city": "Tokyo"},
            "tasteProfile": {"likedEntityIds": [ENTITY]},
        },
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["qlooUsed"] and data["personalized"]
    assert data["places"][0]["nutrition"] is None
    assert data["places"][0]["provenance"]["place"] == "qloo"
    assert client.post("/api/places", json={"location": {}}).status_code == 422


def test_discovery_failure_does_not_return_fixtures(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app

    monkeypatch.delenv("QLOO_API_KEY", raising=False)
    response = TestClient(app).post("/api/places", json={"location": {"city": "Tokyo"}})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "QLOO_NOT_CONFIGURED"
    assert "demo-sora" not in response.text


def test_joint_ranking_entity_join_and_hard_allergy_filter():
    from copy import deepcopy
    from app.catalog import CATALOG
    from app.models import Constraints, DailySummary
    from app.nutrition import assess_nutrition, calculate_gap
    from app.qloo import PlaceAffinity
    from app.ranking import eligible, rank

    menus = deepcopy(CATALOG[:3])
    for index, menu in enumerate(menus):
        menu["qlooEntityId"] = str(UUID(int=index + 1))
    daily, assessment = assess_nutrition(
        DailySummary(proteinG=42, targetProteinG=65, fiberG=10, targetFiberG=25),
        None,
        None,
    )
    signal = PlaceAffinity(
        menus[0]["qlooEntityId"], "Different display name", 1, {}, {"entities": []}
    )
    on = rank(
        menus,
        calculate_gap(daily),
        {},
        True,
        3,
        assessment=assessment,
        affinities={signal.entity_id: signal},
    )
    off = rank(
        menus,
        calculate_gap(daily),
        {},
        False,
        3,
        assessment=assessment,
        affinities={signal.entity_id: signal},
    )
    assert on[0]["candidateId"] == menus[0]["candidateId"]
    assert on[0]["provenance"]["taste"] == "qloo"
    assert all(item["provenance"]["taste"] == "unavailable" for item in off)
    assert {item["candidateId"] for item in on} == {item["candidateId"] for item in off}
    assert on[0]["scores"]["nutrition"]["benefits"]["fiberG"] > 0
    filtered = eligible(Constraints(allergens=["fish"]).model_dump(), menus)
    assert menus[0]["candidateId"] not in [item["candidateId"] for item in filtered]


def live_context(monkeypatch, *, empty=False, allergens=None):
    from copy import deepcopy
    from fastapi.testclient import TestClient
    import app.main as main
    from app.catalog import CATALOG

    monkeypatch.setenv("DATA_MODE", "live_qloo")
    monkeypatch.setenv("QLOO_API_KEY", "test-only")
    menus = deepcopy(CATALOG[:3])
    for index, menu in enumerate(menus):
        menu["candidateId"] = "real-menu-" + str(index)
        menu["qlooEntityId"] = str(UUID(int=index + 1))
        menu["provenance"] = {
            key: "catalog" for key in ["place", "menu", "nutrition", "price", "walk"]
        }
        menu["provenance"]["observedAt"] = "2026-10-09"
    monkeypatch.setattr(
        main, "load_menu_catalog", lambda location: [] if empty else menus
    )
    client = TestClient(main.app)
    sid = str(uuid4())
    response = client.post(
        "/api/interpret",
        json={
            "sessionId": sid,
            "message": "meal under 1000 JPY nearby",
            "location": {"city": "Tokyo"},
            "tasteProfile": {"likedEntityIds": [ENTITY]},
            "allergens": allergens or [],
            "dailySummary": {
                "proteinG": 42,
                "targetProteinG": 65,
                "fiberG": 10,
                "targetFiberG": 25,
            },
        },
    )
    assert response.status_code == 200
    return client, sid, menus


def test_live_on_off_cache_and_refinement(monkeypatch):
    from app.qloo import PlaceAffinity

    client, sid, menus = live_context(monkeypatch)
    calls = []

    async def places(self, **kwargs):
        calls.append(kwargs)
        assert kwargs["entity_ids"] == [ENTITY.lower()]
        assert set(kwargs["candidate_ids"]) == {menu["qlooEntityId"] for menu in menus}
        assert not any(
            key in kwargs for key in ["dailySummary", "allergens", "personalProfile"]
        )
        return [
            PlaceAffinity(menus[0]["qlooEntityId"], "Qloo place", 1, {}, {"test": 0.8})
        ]

    monkeypatch.setattr(LiveQlooProvider, "places", places)
    off = client.post(
        "/api/recommend", json={"sessionId": sid, "qlooEnabled": False}
    ).json()["data"]
    assert not calls and off["qlooStatus"] == "disabled" and not off["qlooUsed"]
    on = client.post("/api/recommend", json={"sessionId": sid}).json()["data"]
    assert on["qlooUsed"] and on["dataMode"] == "live_qloo"
    assert on["comparison"]["candidateIds"] == off["comparison"]["candidateIds"]
    assert on["recommendations"][0]["tasteExplainability"] == {"test": 0.8}
    client.post("/api/recommend", json={"sessionId": sid, "qlooEnabled": False})
    client.post("/api/recommend", json={"sessionId": sid})
    assert len(calls) == 1
    refined = client.post(
        "/api/refine", json={"sessionId": sid, "refinement": "closer"}
    ).json()["data"]
    assert all(menu["walkMinutes"] <= 10 for menu in refined["recommendations"])
    assert all(
        menu["provenance"]["menu"] == "catalog" for menu in refined["recommendations"]
    )


def test_live_failure_matches_local_baseline(monkeypatch):
    client, sid, menus = live_context(monkeypatch)

    async def fail(self, **kwargs):
        raise QlooError("QLOO_UNAVAILABLE")

    monkeypatch.setattr(LiveQlooProvider, "places", fail)
    response = client.post("/api/recommend", json={"sessionId": sid})
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["qlooStatus"] == "fallback" and not data["qlooUsed"]
    assert data["comparison"]["withTaste"] == data["comparison"]["withoutTaste"]
    assert "QLOO_UNAVAILABLE" in response.json()["warnings"]
    assert all(menu["tasteFit"] == "unavailable" for menu in data["recommendations"])


def test_live_without_catalog_is_discovery_only(monkeypatch):
    from app.qloo import PlaceAffinity

    client, sid, menus = live_context(monkeypatch, empty=True)

    async def places(self, **kwargs):
        return [PlaceAffinity(ENTITY.lower(), "Real restaurant", 0.9, {}, {})]

    monkeypatch.setattr(LiveQlooProvider, "places", places)
    response = client.post("/api/recommend", json={"sessionId": sid})
    data = response.json()["data"]
    assert data["qlooStatus"] == "discovery_only" and not data["qlooUsed"]
    assert data["recommendations"] == []
    assert data["placeDiscovery"][0]["nutrition"] is None
    assert "NO_VERIFIED_MENU_CATALOG" in response.json()["warnings"]


def test_live_empty_allergy_filtered_pool_does_not_query_qloo(monkeypatch):
    client, sid, menus = live_context(monkeypatch, allergens=["soy"])

    async def forbidden(self, **kwargs):
        pytest.fail("No Qloo request when every meal fails safety constraints")

    monkeypatch.setattr(LiveQlooProvider, "places", forbidden)
    data = client.post("/api/recommend", json={"sessionId": sid}).json()["data"]
    assert not data["recommendations"] and data["qlooStatus"] == "no_eligible_menus"


def test_catalog_sources_and_route_origin(tmp_path, monkeypatch):
    import json
    from app.catalog import CatalogError, load_menu_catalog

    path = tmp_path / "menus.json"
    monkeypatch.setenv("MENU_CATALOG_PATH", str(path))
    menu = {
        "candidateId": "menu-1",
        "qlooEntityId": ENTITY,
        "placeName": "Restaurant",
        "menuName": "Set meal",
        "city": "Tokyo",
        "price": 900,
        "currency": "JPY",
        "cuisine": "Japanese",
        "proteinG": 25,
        "observedAt": "2026-10-09",
        "menuSource": "https://example.com/menu",
        "priceSource": "https://example.com/menu",
    }
    path.write_text(json.dumps([menu]))
    with pytest.raises(CatalogError, match="MENU_CATALOG_INVALID"):
        load_menu_catalog({"city": "Tokyo"})
    menu.update(
        {
            "nutritionSource": "https://example.com/nutrition",
            "walkMinutes": 10,
            "walkOriginLat": 35.66,
            "walkOriginLng": 139.7,
            "walkSource": "https://example.com/route",
        }
    )
    path.write_text(json.dumps([menu]))
    unknown_route = load_menu_catalog({"city": "Tokyo"})[0]
    assert unknown_route["walkMinutes"] is None
    matched_route = load_menu_catalog({"city": "Tokyo", "lat": 35.66, "lng": 139.7})[0]
    assert matched_route["walkMinutes"] == 10
    assert matched_route["qlooEntityId"] == ENTITY.lower()
    assert not load_menu_catalog({"city": "Paris"})
