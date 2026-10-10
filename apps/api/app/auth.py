import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

import httpx
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import Field, field_validator, model_validator

from .models import StrictModel


class AuthError(Exception):
    def __init__(self, code: str, status: int = 401, retryable: bool = False):
        self.code = code
        self.status = status
        self.retryable = retryable
        super().__init__(code)


class ProfileUpdate(StrictModel):
    nickname: str = Field(min_length=1, max_length=40)
    gender: Literal["male", "female", "other", "undisclosed"]
    birthYear: int = Field(strict=True, ge=1, le=9999)
    birthMonth: int = Field(strict=True, ge=1, le=12)

    @field_validator("nickname", mode="before")
    @classmethod
    def trim_nickname(cls, value):
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def nonfuture_birth(self):
        now = datetime.now(timezone.utc)
        if (self.birthYear, self.birthMonth) > (now.year, now.month):
            raise ValueError("Birth month cannot be in the future")
        return self


@dataclass
class Account:
    id: str
    email: str
    token: str
    profile: dict

    def public(self):
        try:
            ProfileUpdate.model_validate(self.profile)
            complete = True
        except ValueError:
            complete = False
        return {
            "id": self.id,
            "email": self.email,
            "profile": self.profile,
            "profileComplete": complete,
        }


class AuthService:
    def __init__(self, url=None, key=None, transport=None):
        self.url = (url or os.getenv("SUPABASE_URL", "")).rstrip("/")
        self.key = key or os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
        self.transport = transport

    async def call(self, method, path, token, **kwargs):
        if not self.url or not self.key:
            raise AuthError("AUTH_NOT_CONFIGURED", 503)
        try:
            async with httpx.AsyncClient(
                timeout=10, transport=self.transport
            ) as client:
                response = await client.request(
                    method,
                    self.url + path,
                    headers={
                        "apikey": self.key,
                        "Authorization": "Bearer " + token,
                        "Prefer": "return=representation",
                    },
                    **kwargs
                )
            if response.status_code in {401, 403}:
                raise AuthError("AUTH_REQUIRED")
            if not response.is_success:
                raise AuthError("AUTH_UNAVAILABLE", 503, True)
            return response.json()
        except (httpx.HTTPError, ValueError):
            raise AuthError("AUTH_UNAVAILABLE", 503, True) from None

    async def account(self, token):
        user = await self.call("GET", "/auth/v1/user", token)
        if not isinstance(user, dict):
            raise AuthError("AUTH_UNAVAILABLE", 503, True)
        try:
            identifier = str(UUID(user["id"]))
            email = user["email"]
            if (
                not isinstance(email, str)
                or not email
                or not user.get("email_confirmed_at")
                or user.get("is_anonymous")
            ):
                raise AuthError("AUTH_REQUIRED")
        except (KeyError, TypeError, ValueError):
            raise AuthError("AUTH_UNAVAILABLE", 503, True) from None
        rows = await self.call(
            "GET",
            "/rest/v1/profiles",
            token,
            params={
                "id": "eq." + identifier,
                "select": "nickname,gender,birth_year,birth_month",
            },
        )
        if not isinstance(rows, list) or len(rows) != 1:
            raise AuthError("PROFILE_UNAVAILABLE", 503, True)
        row = rows[0]
        if not isinstance(row, dict):
            raise AuthError("PROFILE_UNAVAILABLE", 503, True)
        profile = {
            "nickname": row.get("nickname"),
            "gender": row.get("gender"),
            "birthYear": row.get("birth_year"),
            "birthMonth": row.get("birth_month"),
        }
        return Account(identifier, email, token, profile)

    async def update(self, account, body: ProfileUpdate):
        rows = await self.call(
            "PATCH",
            "/rest/v1/profiles",
            account.token,
            params={"id": "eq." + account.id},
            json={
                "nickname": body.nickname,
                "gender": body.gender,
                "birth_year": body.birthYear,
                "birth_month": body.birthMonth,
            },
        )
        if not isinstance(rows, list) or len(rows) != 1:
            raise AuthError("PROFILE_UNAVAILABLE", 503, True)
        return await self.account(account.token)


def auth_service():
    return AuthService()


bearer = HTTPBearer(auto_error=False)


async def current_account(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    service=Depends(auth_service),
):
    if credentials is None or not credentials.credentials.strip():
        raise AuthError("AUTH_REQUIRED")
    return await service.account(credentials.credentials.strip())


async def complete_account(account=Depends(current_account)):
    if not account.public()["profileComplete"]:
        raise AuthError("PROFILE_REQUIRED", 403)
    return account
