import pytest
from app.auth import Account, current_account
from app.main import app


@pytest.fixture(autouse=True)
def authenticated_existing_flows(request):
    if request.module.__name__.endswith("test_auth"):
        yield
        return

    async def test_account():
        return Account(
            "11111111-1111-4111-8111-111111111111",
            "test@example.com",
            "test",
            {"nickname": "Twin", "gender": "other", "birthYear": 2000, "birthMonth": 1},
        )

    previous = app.dependency_overrides.copy()
    app.dependency_overrides[current_account] = test_account
    yield
    app.dependency_overrides.clear()
    app.dependency_overrides.update(previous)
