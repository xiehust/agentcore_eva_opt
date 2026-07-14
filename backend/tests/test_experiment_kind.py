"""Experiment `kind` (config_bundle | target_based): default, persistence,
server-side validation, and the additive column migration for old DBs."""

from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch, tmp_path):  # type: ignore[no-untyped-def]
    monkeypatch.setenv("LAB4_DB_PATH", str(tmp_path / "test.db"))
    from app import db

    db.reset_for_tests()
    importlib.reload(db)
    db.reset_for_tests()
    db.init()
    from app.main import app

    yield TestClient(app)
    db.reset_for_tests()


def _seed_agent(client: TestClient, *, name: str = "Champ") -> str:
    agent = client.post("/api/agents", json={"name": name, "code": "print('x')"}).json()
    from app import db

    db.update_agent_deployment(
        agent["id"],
        {"status": "deployed", "runtimeArn": "arn:r", "serviceName": "s.DEFAULT"},
    )
    return agent["id"]


def test_kind_defaults_to_config_bundle(client: TestClient) -> None:
    agent_id = _seed_agent(client)
    created = client.post("/api/experiments", json={"name": "E", "agentId": agent_id})
    assert created.status_code == 201
    exp = created.json()
    assert exp["kind"] == "config_bundle"
    # GET and list echo the field.
    assert client.get(f"/api/experiments/{exp['id']}").json()["kind"] == "config_bundle"
    assert client.get("/api/experiments").json()["experiments"][0]["kind"] == "config_bundle"


def test_kind_target_based_persists(client: TestClient) -> None:
    agent_id = _seed_agent(client)
    created = client.post(
        "/api/experiments",
        json={"name": "E", "agentId": agent_id, "kind": "target_based"},
    )
    assert created.status_code == 201
    exp = created.json()
    assert exp["kind"] == "target_based"
    # Persists on GET and list.
    assert client.get(f"/api/experiments/{exp['id']}").json()["kind"] == "target_based"
    listed = client.get("/api/experiments").json()["experiments"]
    assert listed[0]["kind"] == "target_based"


def test_invalid_kind_rejected_422(client: TestClient) -> None:
    agent_id = _seed_agent(client)
    resp = client.post(
        "/api/experiments",
        json={"name": "E", "agentId": agent_id, "kind": "foo"},
    )
    assert resp.status_code == 422


def test_kind_column_migration_defaults_old_rows(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:  # type: ignore[no-untyped-def]
    """A DB created before the `kind` column existed gets ALTERed on connect;
    the pre-existing row reads back kind == 'config_bundle'."""
    import sqlite3

    dbfile = tmp_path / "old.db"
    conn = sqlite3.connect(str(dbfile))
    # experiments table WITHOUT the kind column (pre-migration shape).
    conn.execute(
        """CREATE TABLE experiments (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, agent_id TEXT NOT NULL,
            agent_name TEXT NOT NULL, challenger_agent_id TEXT,
            challenger_agent_name TEXT, stage TEXT NOT NULL,
            artifacts TEXT NOT NULL DEFAULT '{}', error TEXT,
            created_at REAL NOT NULL, updated_at REAL NOT NULL)"""
    )
    conn.execute(
        "INSERT INTO experiments (id, name, agent_id, agent_name, stage, artifacts,"
        " created_at, updated_at) VALUES"
        " ('e1', 'Old', 'a1', 'Champ', 'recommend', '{}', 1.0, 1.0)"
    )
    conn.commit()
    conn.close()

    monkeypatch.setenv("LAB4_DB_PATH", str(dbfile))
    from app import db

    db.reset_for_tests()
    importlib.reload(db)
    db.reset_for_tests()
    db.init()
    row = db.get_experiment("e1")
    assert row is not None
    assert row["kind"] == "config_bundle"  # column added, old row defaulted
    db.reset_for_tests()
