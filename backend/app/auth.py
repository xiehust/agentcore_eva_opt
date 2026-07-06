"""Optional shared-password authentication for internet-facing deployments.

Enabled by setting ``LAB4_AUTH_PASSWORD`` — without it the backend behaves
exactly as before (local dev, tests). When enabled, every ``/api`` route and
the FastAPI docs require a signed session cookie obtained from
``POST /api/auth/login``. The SPA shell and its static assets stay public
(they contain no data); all data flows through the protected API.

Sessions are stateless: the cookie is ``<expiry-ts>.<hmac-sha256>`` signed
with a key derived from the password (so sessions survive backend restarts
and there is nothing to store). Constant-time comparisons throughout.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import time
from typing import Any

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter(prefix="/api/auth", tags=["auth"])

COOKIE_NAME = "lab4_session"
SESSION_TTL_SECONDS = 12 * 3600

# Paths that must stay reachable without a session.
_OPEN_API_PATHS = {"/api/auth/login", "/api/auth/status", "/api/health"}
_PROTECTED_EXTRA = {"/docs", "/redoc", "/openapi.json"}


def _password() -> str | None:
    return os.environ.get("LAB4_AUTH_PASSWORD") or None


def enabled() -> bool:
    return _password() is not None


def _signing_key() -> bytes:
    # Derived from the password: no state, sessions survive restarts, and
    # rotating the password invalidates every outstanding session.
    return hashlib.sha256(f"lab4-session:{_password()}".encode()).digest()


def _sign(expiry: int) -> str:
    sig = hmac.new(_signing_key(), str(expiry).encode(), hashlib.sha256)
    return f"{expiry}.{sig.hexdigest()}"


def _verify(cookie: str | None) -> bool:
    if not cookie or "." not in cookie:
        return False
    expiry_s = cookie.partition(".")[0]
    if not expiry_s.isdigit():
        return False
    expected = _sign(int(expiry_s))
    if not hmac.compare_digest(cookie, expected):
        return False
    return int(expiry_s) > time.time()


def is_authenticated(request: Request) -> bool:
    return _verify(request.cookies.get(COOKIE_NAME))


async def middleware(request: Request, call_next: Any) -> Any:
    """Reject unauthenticated API/docs requests when auth is enabled."""
    if enabled():
        path = request.url.path
        guarded = (
            path.startswith("/api") and path not in _OPEN_API_PATHS
        ) or path in _PROTECTED_EXTRA
        if guarded and not is_authenticated(request):
            return JSONResponse(
                status_code=401, content={"detail": "authentication required"}
            )
    return await call_next(request)


class LoginRequest(BaseModel):
    password: str


@router.get("/status")
def status(request: Request) -> dict[str, Any]:
    return {
        "authRequired": enabled(),
        "authenticated": (not enabled()) or is_authenticated(request),
    }


@router.post("/login")
def login(req: LoginRequest, response: Response) -> Any:
    if not enabled():
        return {"ok": True, "authRequired": False}
    expected = _password() or ""
    if not hmac.compare_digest(req.password.encode(), expected.encode()):
        return JSONResponse(status_code=401, content={"detail": "invalid password"})
    expiry = int(time.time()) + SESSION_TTL_SECONDS
    response.set_cookie(
        COOKIE_NAME,
        _sign(expiry),
        max_age=SESSION_TTL_SECONDS,
        httponly=True,
        samesite="lax",
        path="/",
    )
    return {"ok": True, "expiresAt": expiry}


@router.post("/logout")
def logout(response: Response) -> dict[str, Any]:
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}
