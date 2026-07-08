"""External agent registration: kind/binding on the agents resource."""

from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch, tmp_path):  # type: ignore[no-untyped-def]
    """Fresh temp DB per test (same reload pattern as test_persistence)."""
    monkeypatch.setenv("LAB4_DB_PATH", str(tmp_path / "test.db"))
    from app import db

    db.reset_for_tests()
    importlib.reload(db)
    db.reset_for_tests()
    db.init()
    from app.main import app

    yield TestClient(app)
    db.reset_for_tests()


BINDING = {
    "serviceName": "my-external-agent",
    "logGroup": "/my/agent/log-group",
    "region": "us-west-2",
}

EXTERNAL = {
    "name": "Ext Agent",
    "description": "runs elsewhere",
    "kind": "external",
    "binding": BINDING,
}


def test_register_external_agent_round_trip(client: TestClient) -> None:
    created = client.post("/api/agents", json=EXTERNAL)
    assert created.status_code == 201
    agent = created.json()
    assert agent["kind"] == "external"
    assert agent["binding"]["serviceName"] == "my-external-agent"
    assert agent["binding"]["logGroup"] == "/my/agent/log-group"
    assert agent["binding"]["region"] == "us-west-2"
    assert agent["binding"]["invoke"] is None
    assert agent["code"] == ""
    assert agent["deployment"] is None

    got = client.get(f"/api/agents/{agent['id']}").json()
    assert got["kind"] == "external"
    assert got["binding"] == agent["binding"]

    # List responses carry kind/binding too.
    listed = client.get("/api/agents").json()["agents"]
    assert listed[0]["kind"] == "external"
    assert listed[0]["binding"]["serviceName"] == "my-external-agent"


def test_external_agent_requires_binding(client: TestClient) -> None:
    no_binding = {"name": "Ext", "kind": "external"}
    assert client.post("/api/agents", json=no_binding).status_code == 422

    missing_service = {
        "name": "Ext",
        "kind": "external",
        "binding": {"logGroup": "/lg"},
    }
    assert client.post("/api/agents", json=missing_service).status_code == 422

    missing_log_group = {
        "name": "Ext",
        "kind": "external",
        "binding": {"serviceName": "svc"},
    }
    assert client.post("/api/agents", json=missing_log_group).status_code == 422


def test_legacy_payload_defaults_to_managed(client: TestClient) -> None:
    legacy = {"name": "My Agent", "code": "print('hi')"}
    created = client.post("/api/agents", json=legacy)
    assert created.status_code == 201
    agent = created.json()
    assert agent["kind"] == "managed"
    assert agent["binding"] is None


def test_external_agent_rejected_from_deploy(client: TestClient) -> None:
    agent = client.post("/api/agents", json=EXTERNAL).json()
    deploy = client.post(f"/api/agents/{agent['id']}/deploy", json={})
    assert deploy.status_code == 400
    assert "registered, not deployed" in deploy.json()["detail"]

    undeploy = client.post(f"/api/agents/{agent['id']}/undeploy", json={})
    assert undeploy.status_code == 400
    assert "registered, not deployed" in undeploy.json()["detail"]


def test_update_binding_on_external_agent(client: TestClient) -> None:
    agent = client.post("/api/agents", json=EXTERNAL).json()
    new_binding = {"serviceName": "renamed-svc", "logGroup": "/new/lg"}
    updated = client.put(
        f"/api/agents/{agent['id']}", json={"binding": new_binding}
    ).json()
    assert updated["binding"]["serviceName"] == "renamed-svc"
    assert updated["binding"]["logGroup"] == "/new/lg"
    # Other fields untouched by the partial update.
    assert updated["name"] == "Ext Agent"
    assert updated["kind"] == "external"


def test_invoke_url_scheme_validated(client: TestClient) -> None:
    bad = {
        "name": "Ext",
        "kind": "external",
        "binding": {**BINDING, "invoke": {"url": "ftp://example.com/run"}},
    }
    resp = client.post("/api/agents", json=bad)
    assert resp.status_code == 422
    assert "http(s)" in resp.json()["detail"]

    good = {
        "name": "Ext",
        "kind": "external",
        "binding": {**BINDING, "invoke": {"url": "https://example.com/run"}},
    }
    created = client.post("/api/agents", json=good)
    assert created.status_code == 201
    invoke = created.json()["binding"]["invoke"]
    assert invoke["url"] == "https://example.com/run"
    assert invoke["sessionHeader"] == "X-Session-Id"
    assert invoke["timeoutSeconds"] == 60


def test_migration_adds_columns_to_existing_db(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    """Opening a pre-kind/binding DB adds the columns; re-opening is safe."""
    import sqlite3

    db_path = tmp_path / "old.db"
    conn = sqlite3.connect(db_path)
    conn.execute(
        """
        CREATE TABLE agents (
            id TEXT PRIMARY KEY, name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '', code TEXT NOT NULL,
            requirements TEXT NOT NULL DEFAULT '[]', deployment TEXT,
            created_at REAL NOT NULL, updated_at REAL NOT NULL
        )
        """
    )
    conn.execute(
        "INSERT INTO agents VALUES ('a1', 'Old', '', 'code', '[]', NULL, 1.0, 1.0)"
    )
    conn.commit()
    conn.close()

    monkeypatch.setenv("LAB4_DB_PATH", str(db_path))
    from app import db

    db.reset_for_tests()
    importlib.reload(db)
    db.reset_for_tests()
    db.init()
    db.init()  # idempotent second open

    agent = db.get_agent("a1")
    assert agent is not None
    assert agent["kind"] == "managed"
    assert agent["binding"] is None
    db.reset_for_tests()
