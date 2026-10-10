import asyncio
from uuid import uuid4

import httpx
import pytest
from pydantic import ValidationError

from app.auth import AuthError, AuthService, ProfileUpdate


def test_verified_identity_and_profile_update():
    identifier = str(uuid4())
    row = {"nickname": None, "gender": None, "birth_year": None, "birth_month": None}

    def respond(request):
        assert request.headers["Authorization"] == "Bearer test-token"
        assert request.headers["apikey"] == "public-test-key"
        if request.url.path == "/auth/v1/user":
            return httpx.Response(
                200,
                json={
                    "id": identifier,
                    "email": "a@example.com",
                    "email_confirmed_at": "2026-01-01",
                },
            )
        assert request.url.params["id"] == "eq." + identifier
        if request.method == "PATCH":
            import json

            row.update(json.loads(request.content))
            assert "email" not in row and "id" not in row
        return httpx.Response(200, json=[row])

    async def flow():
        service = AuthService(
            "https://test.supabase.co", "public-test-key", httpx.MockTransport(respond)
        )
        account = await service.account("test-token")
        assert not account.public()["profileComplete"]
        account = await service.update(
            account,
            ProfileUpdate(
                nickname=" Twin ", gender="undisclosed", birthYear=2000, birthMonth=2
            ),
        )
        assert account.id == identifier and account.public()["profileComplete"]
        assert account.profile["nickname"] == "Twin"

    asyncio.run(flow())


@pytest.mark.parametrize(
    "status,code", [(401, "AUTH_REQUIRED"), (503, "AUTH_UNAVAILABLE")]
)
def test_auth_failures(status, code):
    service = AuthService(
        "https://test.supabase.co",
        "key",
        httpx.MockTransport(lambda request: httpx.Response(status, json={})),
    )
    with pytest.raises(AuthError, match=code):
        asyncio.run(service.account("token"))


def test_unverified_email_rejected():
    service = AuthService(
        "https://test.supabase.co",
        "key",
        httpx.MockTransport(
            lambda request: httpx.Response(
                200, json={"id": str(uuid4()), "email": "a@example.com"}
            )
        ),
    )
    with pytest.raises(AuthError, match="AUTH_REQUIRED"):
        asyncio.run(service.account("token"))


@pytest.mark.parametrize(
    "changes",
    [
        {"nickname": "   "},
        {"gender": "invalid"},
        {"birthMonth": 13},
        {"birthYear": 9999},
        {"birthYear": True},
        {"email": "spoof@example.com"},
    ],
)
def test_profile_validation(changes):
    with pytest.raises(ValidationError):
        ProfileUpdate.model_validate(
            {
                "nickname": "Twin",
                "gender": "other",
                "birthYear": 2000,
                "birthMonth": 1,
                **changes,
            }
        )


def test_api_auth_and_session_ownership():
    from fastapi import Request
    from fastapi.testclient import TestClient
    from app.auth import Account, current_account
    from app.main import app, sessions

    client = TestClient(app)
    assert client.get("/api/me").status_code == 401
    assert client.get("/api/health").status_code == 200
    profile = {"nickname": "Twin", "gender": "male", "birthYear": 2000, "birthMonth": 1}

    async def identity(request: Request):
        name = request.headers.get("authorization", "A")
        return Account(
            name, name + "@example.com", name, profile if name != "incomplete" else {}
        )

    app.dependency_overrides[current_account] = identity
    sessions.clear()
    try:
        sid = str(uuid4())
        body = {
            "sessionId": sid,
            "message": "Japanese under 1000 JPY nearby",
            "location": {"city": "Tokyo"},
        }
        assert (
            client.post(
                "/api/interpret", json=body, headers={"Authorization": "incomplete"}
            ).status_code
            == 403
        )
        assert (
            client.get("/api/me", headers={"Authorization": "incomplete"}).json()[
                "data"
            ]["profileComplete"]
            is False
        )
        assert client.post("/api/interpret", json=body).status_code == 200
        assert sessions[sid]["context"]["accountProfile"]["id"] == "A"
        for method, path, payload in [
            ("GET", "/api/sessions/" + sid, None),
            ("DELETE", "/api/sessions/" + sid, None),
            ("POST", "/api/interpret", body),
            ("POST", "/api/recommend", {"sessionId": sid}),
            ("POST", "/api/refine", {"sessionId": sid, "refinement": "closer"}),
            ("POST", "/api/select", {"sessionId": sid, "candidateId": "demo-sora"}),
        ]:
            response = client.request(
                method,
                path,
                headers={"Authorization": "B"},
                **({"json": payload} if payload else {})
            )
            assert response.status_code == 404, response.text
            assert sessions[sid]["userId"] == "A"
        assert client.delete("/api/sessions/" + sid).status_code == 200
    finally:
        app.dependency_overrides.clear()
        sessions.clear()


def test_profile_endpoint_save_and_invalidation():
    from fastapi.testclient import TestClient
    from app.auth import Account, auth_service, current_account
    from app.main import app, sessions

    account = Account(
        str(uuid4()),
        "a@example.com",
        "test",
        {"nickname": "Twin", "gender": "female", "birthYear": 2000, "birthMonth": 1},
    )

    async def identity():
        return account

    class ProfileService:
        async def update(self, owner, body):
            assert owner.id == account.id
            account.profile = body.model_dump()
            return account

    app.dependency_overrides[current_account] = identity
    app.dependency_overrides[auth_service] = ProfileService
    sessions.clear()
    sessions["owned"] = {"userId": account.id}
    sessions["other"] = {"userId": "another-user"}
    client = TestClient(app)
    body = {
        "nickname": " Updated ",
        "gender": "other",
        "birthYear": 1999,
        "birthMonth": 12,
    }
    try:
        assert (
            client.patch(
                "/api/me", json={**body, "email": "spoof@example.com"}
            ).status_code
            == 422
        )
        result = client.patch("/api/me", json=body)
        assert result.status_code == 200
        saved = result.json()["data"]
        assert saved["id"] == account.id and saved["email"] == account.email
        assert saved["profile"]["nickname"] == "Updated" and saved["profileComplete"]
        assert "owned" not in sessions and "other" in sessions
        assert client.get("/api/me").json()["data"] == saved
    finally:
        app.dependency_overrides.clear()
        sessions.clear()


def test_authenticated_cors_and_openapi():
    from fastapi.testclient import TestClient
    from app.main import app

    response = TestClient(app).options(
        "/api/me",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "PATCH",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert response.status_code == 200
    assert "PATCH" in response.headers["access-control-allow-methods"]
    schema = app.openapi()
    assert schema["paths"]["/api/me"]["get"]["security"] == [{"HTTPBearer": []}]
    assert "security" not in schema["paths"]["/api/health"]["get"]
