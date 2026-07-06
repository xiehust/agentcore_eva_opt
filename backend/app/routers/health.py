"""Health + identity endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from ..aws import DEFAULT_REGION, get_session, sts
from ..models import CredsRequest, IdentityResponse

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/identity", response_model=IdentityResponse)
def identity(req: CredsRequest | None = None) -> IdentityResponse:
    """Resolve the caller identity for the supplied creds (or the default IAM chain).

    Bad/invalid credentials return a structured error (ok=false) rather than a 500,
    so the UI can render a readable message.
    """
    creds = req.creds if req else None
    try:
        session = get_session(creds)
        ident = sts(session).get_caller_identity()
        return IdentityResponse(
            ok=True,
            account=ident.get("Account"),
            arn=ident.get("Arn"),
            region=session.region_name or DEFAULT_REGION,
        )
    except Exception as exc:  # noqa: BLE001 — report auth/transport errors as data
        return IdentityResponse(ok=False, error=f"{type(exc).__name__}: {exc}")
