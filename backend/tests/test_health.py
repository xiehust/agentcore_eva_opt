"""Phase 1 tests: health, identity error-shaping, jobs 404, session factory branches."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.aws import DEFAULT_REGION, get_session
from app.main import app
from app.models import Creds

client = TestClient(app)


def test_health_ok() -> None:
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_identity_bad_creds_is_structured_not_500() -> None:
    """Obviously-invalid creds must return ok=false, not raise a 500."""
    resp = client.post(
        "/api/identity",
        json={
            "creds": {
                "accessKeyId": "AKIAINVALIDEXAMPLE123",
                "secretAccessKey": "not-a-real-secret",
                "region": "us-west-2",
            }
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False
    assert body["error"]  # a readable error string is present


def test_jobs_unknown_id_404() -> None:
    resp = client.get("/api/jobs/does-not-exist")
    assert resp.status_code == 404


def test_get_session_scoped_when_akid_provided() -> None:
    creds = Creds(
        accessKeyId="AKIAEXAMPLE",
        secretAccessKey="secret",
        sessionToken="token",
        region="eu-west-1",
    )
    session = get_session(creds)
    assert session.region_name == "eu-west-1"
    frozen = session.get_credentials().get_frozen_credentials()
    assert frozen.access_key == "AKIAEXAMPLE"
    assert frozen.token == "token"


def test_get_session_default_chain_when_no_creds() -> None:
    """No creds → default region + default provider chain (EC2 role on this host)."""
    session = get_session(None)
    assert session.region_name == DEFAULT_REGION
