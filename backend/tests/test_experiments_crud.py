"""Experiments CRUD: validation, artifact shallow-merge, restart survival."""

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


def _seed_agent(client: TestClient, *, deployed: bool = True, name: str = "Champ") -> str:
    agent = client.post("/api/agents", json={"name": name, "code": "print('x')"}).json()
    if deployed:
        from app import db

        db.update_agent_deployment(
            agent["id"],
            {"status": "deployed", "runtimeArn": "arn:r", "serviceName": "s.DEFAULT"},
        )
    return agent["id"]


def test_create_requires_deployed_agent(client: TestClient) -> None:
    assert (
        client.post("/api/experiments", json={"name": "e", "agentId": "nope"}).status_code
        == 404
    )
    undeployed = _seed_agent(client, deployed=False)
    resp = client.post("/api/experiments", json={"name": "e", "agentId": undeployed})
    assert resp.status_code == 400
    assert "not deployed" in resp.json()["detail"]


def test_create_and_list(client: TestClient) -> None:
    agent_id = _seed_agent(client)
    created = client.post("/api/experiments", json={"name": "Exp 1", "agentId": agent_id})
    assert created.status_code == 201
    exp = created.json()
    assert exp["stage"] == "recommend"
    assert exp["agentName"] == "Champ"
    assert exp["artifacts"] == {}
    listed = client.get("/api/experiments").json()["experiments"]
    assert [e["id"] for e in listed] == [exp["id"]]


def test_artifacts_shallow_merge_across_puts(client: TestClient) -> None:
    agent_id = _seed_agent(client)
    exp = client.post("/api/experiments", json={"name": "e", "agentId": agent_id}).json()
    eid = exp["id"]

    # First PUT: job id persisted before polling.
    client.put(f"/api/experiments/{eid}", json={"artifacts": {"gatewaySetupJobId": "j1"}})
    # Second PUT: result keys — earlier keys must survive.
    updated = client.put(
        f"/api/experiments/{eid}",
        json={"artifacts": {"gatewayId": "gw-1", "gatewayArn": "arn:gw"}, "stage": "abtest"},
    ).json()
    assert updated["artifacts"] == {
        "gatewaySetupJobId": "j1",
        "gatewayId": "gw-1",
        "gatewayArn": "arn:gw",
    }
    assert updated["stage"] == "abtest"


def test_invalid_stage_422(client: TestClient) -> None:
    agent_id = _seed_agent(client)
    exp = client.post("/api/experiments", json={"name": "e", "agentId": agent_id}).json()
    resp = client.put(f"/api/experiments/{exp['id']}", json={"stage": "warp-speed"})
    assert resp.status_code == 422


def test_challenger_resolution(client: TestClient) -> None:
    agent_id = _seed_agent(client)
    challenger_id = _seed_agent(client, name="Challenger")
    exp = client.post("/api/experiments", json={"name": "e", "agentId": agent_id}).json()
    updated = client.put(
        f"/api/experiments/{exp['id']}", json={"challengerAgentId": challenger_id}
    ).json()
    assert updated["challengerAgentId"] == challenger_id
    assert updated["challengerAgentName"] == "Challenger"
    # Unknown challenger → 404.
    assert (
        client.put(
            f"/api/experiments/{exp['id']}", json={"challengerAgentId": "nope"}
        ).status_code
        == 404
    )


def test_delete_and_404s(client: TestClient) -> None:
    agent_id = _seed_agent(client)
    exp = client.post("/api/experiments", json={"name": "e", "agentId": agent_id}).json()
    assert client.delete(f"/api/experiments/{exp['id']}").json() == {"ok": True}
    assert client.get(f"/api/experiments/{exp['id']}").status_code == 404
    assert client.put("/api/experiments/nope", json={}).status_code == 404


def test_survives_restart(client: TestClient) -> None:
    from app import db

    agent_id = _seed_agent(client)
    exp = client.post("/api/experiments", json={"name": "e", "agentId": agent_id}).json()
    client.put(f"/api/experiments/{exp['id']}", json={"artifacts": {"bundleAbTestId": "ab1"}})
    db.reset_for_tests()  # simulate restart (same file DB)
    row = db.get_experiment(exp["id"])
    assert row is not None
    assert row["artifacts"]["bundleAbTestId"] == "ab1"


def test_agents_config_round_trip(client: TestClient) -> None:
    """config column: create with config, partial update preserves it."""
    created = client.post(
        "/api/agents",
        json={
            "name": "A",
            "code": "x",
            "config": {"systemPrompt": "You are helpful.", "toolDescriptions": {"t1": "d1"}},
        },
    ).json()
    aid = created["id"]
    assert created["config"] == {
        "systemPrompt": "You are helpful.",
        "toolDescriptions": {"t1": "d1"},
    }
    # List includes config too (experiment create form warns on missing config).
    listed = client.get("/api/agents").json()["agents"][0]
    assert listed["config"]["systemPrompt"] == "You are helpful."
    # Partial update without config keeps it.
    updated = client.put(f"/api/agents/{aid}", json={"name": "A2"}).json()
    assert updated["config"]["toolDescriptions"] == {"t1": "d1"}
    # Update with config replaces it.
    updated = client.put(
        f"/api/agents/{aid}",
        json={"config": {"systemPrompt": "v2", "toolDescriptions": {}}},
    ).json()
    assert updated["config"] == {"systemPrompt": "v2", "toolDescriptions": {}}


def test_agents_config_migration(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:  # type: ignore[no-untyped-def]
    """A DB created before the config column existed gets ALTERed on connect."""
    import sqlite3

    dbfile = tmp_path / "old.db"
    conn = sqlite3.connect(str(dbfile))
    conn.execute(
        """CREATE TABLE agents (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
            code TEXT NOT NULL, requirements TEXT NOT NULL DEFAULT '[]', deployment TEXT,
            created_at REAL NOT NULL, updated_at REAL NOT NULL)"""
    )
    conn.execute(
        "INSERT INTO agents VALUES ('a1', 'Old', '', 'code', '[]', NULL, 1.0, 1.0)"
    )
    conn.commit()
    conn.close()

    monkeypatch.setenv("LAB4_DB_PATH", str(dbfile))
    import importlib

    from app import db

    db.reset_for_tests()
    importlib.reload(db)
    db.reset_for_tests()
    db.init()
    agent = db.get_agent("a1")
    assert agent is not None
    assert agent["config"] is None  # column added, old row null
    db.update_agent("a1", config={"systemPrompt": "p", "toolDescriptions": {}})
    assert db.get_agent("a1")["config"]["systemPrompt"] == "p"
    db.reset_for_tests()
