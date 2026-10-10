import asyncio
import json
from uuid import uuid4

import httpx
import pytest
from pydantic import ValidationError

from app.auth import Account
from app.notebook import DietaryPreferences, HealthCreate, NotebookError, NotebookStore


def health(**changes):
    return {
        "weightKg": 60,
        "heightCm": 165,
        "bodyFatStatus": "unknown",
        "goal": "wellness",
        "chronotype": "morning",
        "breakfastHabit": "often",
        "lunchHabit": "often",
        "dinnerHabit": "sometimes",
        **changes,
    }


@pytest.mark.parametrize(
    "changes",
    [
        {"allergyStatus": "none", "allergens": ["milk"]},
        {"allergyStatus": "selected", "allergens": []},
        {"allergyStatus": "selected", "allergens": ["other"]},
        {"allergyStatus": "selected", "allergens": ["milk", "milk"]},
        {"avoidanceOther": "unselected detail"},
        {"userId": str(uuid4())},
    ],
)
def test_dietary_validation(changes):
    with pytest.raises(ValidationError):
        DietaryPreferences.model_validate(changes)


@pytest.mark.parametrize(
    "changes",
    [
        {"weightKg": 0},
        {"weightKg": True},
        {"heightCm": 0},
        {"bodyFatStatus": "measured"},
        {"bodyFatPct": 20},
        {"bodyFatStatus": "measured", "bodyFatPct": 100},
        {"weightKg": float("inf")},
        {"chronotype": "invalid"},
        {"recordedAt": "2026-01-01"},
        {"bmi": 22},
    ],
)
def test_health_validation(changes):
    with pytest.raises(ValidationError):
        HealthCreate.model_validate(health(**changes))


def test_city_saved_restored_and_omitted_by_older_clients():
    account = Account(str(uuid4()), "test@example.com", "token", {})
    row = None

    def respond(request):
        nonlocal row
        if request.method == "POST":
            row = json.loads(request.content)
        elif request.method == "PATCH":
            row.update(json.loads(request.content))
        fields = request.url.params["select"].split(",")
        return httpx.Response(
            200, json=[{key: row[key] for key in fields if key in row}] if row else []
        )

    async def flow():
        store = NotebookStore(
            "https://test.supabase.co", "key", httpx.MockTransport(respond)
        )
        assert (await store.dietary(account)).city == ""
        saved = await store.save_dietary(account, DietaryPreferences(city=" Tokyo "))
        assert saved.city == "Tokyo"
        assert (await store.dietary(account)).city == "Tokyo"
        await store.save_dietary(account, DietaryPreferences(allergy_status="none"))
        assert (await store.dietary(account)).city == "Tokyo"
        await store.save_dietary(account, DietaryPreferences(city="Osaka"))
        assert (await store.dietary(account)).city == "Osaka"

    asyncio.run(flow())
    with pytest.raises(ValidationError):
        DietaryPreferences(city="x" * 81)


def test_append_history_bmi_and_retry_without_overwrite():
    account = Account(str(uuid4()), "test@example.com", "test-token", {})
    rows = []

    def respond(request):
        assert request.headers["Authorization"] == "Bearer test-token"
        if request.method == "POST":
            row = json.loads(request.content)
            assert row.pop("user_id") == account.id
            assert "recorded_at" not in row and "bmi" not in row
            row["recorded_at"] = "2026-10-10T00:00:0" + str(len(rows)) + "Z"
            rows.insert(0, row)
            return httpx.Response(201, json=[row])
        assert request.url.params["user_id"] == "eq." + account.id
        if "id" in request.url.params:
            found = [
                row for row in rows if "eq." + row["id"] == request.url.params["id"]
            ]
            return httpx.Response(200, json=found)
        return httpx.Response(200, json=rows)

    async def flow():
        store = NotebookStore(
            "https://test.supabase.co", "public-key", httpx.MockTransport(respond)
        )
        assert (await store.history(account))["records"] == []
        first = HealthCreate.model_validate(health())
        saved = await store.add_health(account, first)
        assert saved["bmi"] == 22 and saved["bodyFatPct"] is None
        second = HealthCreate.model_validate(health(weightKg=65))
        await store.add_health(account, second)
        assert len(rows) == 2 and rows[1]["weight_kg"] == 60
        assert (await store.history(account))["records"][0]["weightKg"] == 65
        assert await store.add_health(account, first) == saved
        assert len(rows) == 2
        with pytest.raises(NotebookError, match="NOTEBOOK_CONFLICT"):
            await store.add_health(
                account,
                HealthCreate.model_validate(health(id=str(first.id), weightKg=70)),
            )
        assert rows[1]["weight_kg"] == 60

    asyncio.run(flow())


@pytest.mark.parametrize(
    "status,code",
    [
        (401, "AUTH_REQUIRED"),
        (403, "NOTEBOOK_UNAVAILABLE"),
        (404, "NOTEBOOK_UNAVAILABLE"),
        (409, "NOTEBOOK_CONFLICT"),
        (503, "NOTEBOOK_UNAVAILABLE"),
    ],
)
def test_store_failures_are_not_empty_history(status, code):
    account = Account(str(uuid4()), "test@example.com", "token", {})
    store = NotebookStore(
        "https://test.supabase.co",
        "key",
        httpx.MockTransport(
            lambda request: httpx.Response(
                status, json={"message": "PRIVATE_UPSTREAM_CONTENT"}
            )
        ),
    )
    with pytest.raises(NotebookError, match=code) as error:
        asyncio.run(store.history(account))
    assert "PRIVATE_UPSTREAM_CONTENT" not in str(error.value)


def test_collection_endpoints_are_separate_and_append_only():
    from fastapi.testclient import TestClient
    from app.main import app, sessions
    from app.notebook import notebook_store

    class Store:
        def __init__(self):
            self.rows = []

        async def dietary(self, account):
            return DietaryPreferences()

        async def save_dietary(self, account, body):
            return body

        async def history(self, account, offset, limit):
            return {"records": self.rows, "nextOffset": None}

        async def add_health(self, account, body):
            row = body.model_dump(mode="json", by_alias=True)
            self.rows.insert(0, row)
            return row

    store = Store()
    app.dependency_overrides[notebook_store] = lambda: store
    client = TestClient(app)
    sessions["untouched"] = {"userId": "11111111-1111-4111-8111-111111111111"}
    try:
        assert (
            client.get("/api/me/dietary-preferences").json()["data"]["allergyStatus"]
            == "unknown"
        )
        body = {
            "allergyStatus": "selected",
            "allergens": ["tree_nut", "mango", "other"],
            "allergyOther": "test detail",
        }
        assert client.patch("/api/me/dietary-preferences", json=body).status_code == 200
        assert client.post("/api/me/health-records", json=health()).status_code == 200
        assert (
            client.post("/api/me/health-records", json=health(weightKg=65)).status_code
            == 200
        )
        assert len(client.get("/api/me/health-records").json()["data"]["records"]) == 2
        assert (
            client.post(
                "/api/me/health-records", json=health(userId=str(uuid4()))
            ).status_code
            == 422
        )
        assert client.patch("/api/me/health-records", json=health()).status_code == 405
        assert client.delete("/api/me/health-records").status_code == 405
        assert "untouched" in sessions
    finally:
        app.dependency_overrides.pop(notebook_store, None)
        sessions.pop("untouched", None)
