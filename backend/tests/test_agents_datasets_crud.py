"""Console resources: agents + datasets CRUD over HTTP."""

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


AGENT = {
    "name": "My Agent",
    "description": "test agent",
    "code": "print('hi')",
    "requirements": ["httpx>=0.27"],
}


def test_agent_crud_round_trip(client: TestClient) -> None:
    created = client.post("/api/agents", json=AGENT)
    assert created.status_code == 201
    agent = created.json()
    agent_id = agent["id"]
    assert agent["code"] == "print('hi')"
    assert agent["requirements"] == ["httpx>=0.27"]
    assert agent["deployment"] is None

    # List is light: no code field.
    listed = client.get("/api/agents").json()["agents"]
    assert [a["id"] for a in listed] == [agent_id]
    assert "code" not in listed[0]

    # Get includes code.
    got = client.get(f"/api/agents/{agent_id}").json()
    assert got["code"] == "print('hi')"

    # Partial update: only code changes.
    updated = client.put(f"/api/agents/{agent_id}", json={"code": "print('v2')"}).json()
    assert updated["code"] == "print('v2')"
    assert updated["name"] == "My Agent"
    assert updated["requirements"] == ["httpx>=0.27"]

    assert client.delete(f"/api/agents/{agent_id}").json() == {"ok": True}
    assert client.get(f"/api/agents/{agent_id}").status_code == 404


def test_agent_404s(client: TestClient) -> None:
    assert client.get("/api/agents/nope").status_code == 404
    assert client.put("/api/agents/nope", json={"name": "x"}).status_code == 404
    assert client.delete("/api/agents/nope").status_code == 404
    assert client.post("/api/agents/nope/deploy", json={}).status_code == 404


def test_dataset_crud_round_trip(client: TestClient) -> None:
    body = {
        "name": "DS",
        "description": "d",
        "items": [
            {"prompt": "p1", "context": "ctx."},
            {"prompt": "p2"},
        ],
    }
    created = client.post("/api/datasets", json=body)
    assert created.status_code == 201
    ds = created.json()
    ds_id = ds["id"]
    assert ds["items"] == [{"prompt": "p1", "context": "ctx."}, {"prompt": "p2"}]

    listed = client.get("/api/datasets").json()["datasets"]
    assert [d["id"] for d in listed] == [ds_id]

    updated = client.put(
        f"/api/datasets/{ds_id}", json={"items": [{"prompt": "only"}]}
    ).json()
    assert updated["items"] == [{"prompt": "only"}]
    assert updated["name"] == "DS"

    assert client.delete(f"/api/datasets/{ds_id}").json() == {"ok": True}
    assert client.get(f"/api/datasets/{ds_id}").status_code == 404


def test_dataset_items_validated(client: TestClient) -> None:
    resp = client.post("/api/datasets", json={"name": "bad", "items": [{"nope": 1}]})
    assert resp.status_code == 422
