"""Shared-password auth: disabled by default, gate + signed cookie when
LAB4_AUTH_PASSWORD is set."""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from app import auth
from app.main import app

client = TestClient(app)


@pytest.fixture()
def enabled(monkeypatch: pytest.MonkeyPatch):  # type: ignore[no-untyped-def]
    monkeypatch.setenv("LAB4_AUTH_PASSWORD", "s3cret")
    yield
    client.cookies.clear()


def test_disabled_by_default_everything_open() -> None:
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/agents").status_code == 200
    s = client.get("/api/auth/status").json()
    assert s == {"authRequired": False, "authenticated": True}
    # Login is a no-op without a configured password.
    assert client.post("/api/auth/login", json={"password": "x"}).json() == {
        "ok": True,
        "authRequired": False,
    }


def test_enabled_blocks_api_until_login(enabled: None) -> None:
    # Guarded routes 401 without a session.
    assert client.get("/api/agents").status_code == 401
    assert client.get("/docs").status_code == 401
    assert client.get("/openapi.json").status_code == 401
    # Open paths still reachable (health checks, the auth endpoints).
    assert client.get("/api/health").status_code == 200
    s = client.get("/api/auth/status").json()
    assert s == {"authRequired": True, "authenticated": False}

    # Wrong password rejected.
    assert (
        client.post("/api/auth/login", json={"password": "nope"}).status_code == 401
    )

    # Correct password sets the session cookie and unlocks the API.
    resp = client.post("/api/auth/login", json={"password": "s3cret"})
    assert resp.status_code == 200
    assert auth.COOKIE_NAME in resp.cookies
    assert client.get("/api/agents").status_code == 200
    assert client.get("/api/auth/status").json()["authenticated"] is True

    # Logout clears the session.
    client.post("/api/auth/logout")
    assert client.get("/api/agents").status_code == 401


def test_tampered_and_expired_cookies_rejected(enabled: None) -> None:
    client.post("/api/auth/login", json={"password": "s3cret"})
    good = client.cookies[auth.COOKIE_NAME]

    # Tampered signature.
    client.cookies.set(auth.COOKIE_NAME, good[:-4] + "0000")
    assert client.get("/api/agents").status_code == 401

    # Expired-but-correctly-signed cookie.
    client.cookies.set(auth.COOKIE_NAME, auth._sign(int(time.time()) - 10))
    assert client.get("/api/agents").status_code == 401

    # Garbage.
    client.cookies.set(auth.COOKIE_NAME, "not-a-session")
    assert client.get("/api/agents").status_code == 401


def test_sessions_survive_restart_but_not_password_rotation(
    enabled: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    client.post("/api/auth/login", json={"password": "s3cret"})
    # Stateless HMAC cookie: still valid with no server-side session store.
    assert client.get("/api/agents").status_code == 200
    # Rotating the password invalidates every outstanding session.
    monkeypatch.setenv("LAB4_AUTH_PASSWORD", "newpass")
    assert client.get("/api/agents").status_code == 401
