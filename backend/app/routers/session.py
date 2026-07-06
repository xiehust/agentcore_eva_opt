"""Session-state persistence — save/load the frontend journey snapshot.

The frontend POSTs a JSON snapshot of its journey (mode, active step, per-step
status, artifacts) keyed by a client-generated session id, and GETs it back on
load so progress survives a page reload OR a backend restart.

Security: credentials are NEVER accepted or stored here. The frontend strips
AK/SK before saving; this endpoint persists whatever JSON it's given as-is, but
the model + frontend contract keep secrets out.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import db

router = APIRouter(prefix="/api", tags=["session"])


class SessionSnapshot(BaseModel):
    sessionId: str
    data: dict[str, Any]


@router.put("/session")
def save_session(snapshot: SessionSnapshot) -> dict[str, bool]:
    db.save_session(snapshot.sessionId, snapshot.data)
    return {"ok": True}


@router.get("/session/{session_id}")
def load_session(session_id: str) -> dict[str, Any]:
    data = db.load_session(session_id)
    if data is None:
        raise HTTPException(status_code=404, detail="no saved session")
    return {"sessionId": session_id, "data": data}


@router.delete("/session/{session_id}")
def delete_session(session_id: str) -> dict[str, bool]:
    db.delete_session(session_id)
    return {"ok": True}
