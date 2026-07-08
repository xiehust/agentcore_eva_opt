"""Passive evaluation runs: batch eval over existing traffic, zero invocation."""

from __future__ import annotations

import importlib
import time
from typing import Any

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


class FakeDataClient:
    """Captures batch-eval calls; explodes if traffic is attempted."""

    def __init__(self) -> None:
        self.batch_calls: list[dict[str, Any]] = []
        self.invocations: list[dict[str, Any]] = []

    def invoke_agent_runtime(self, **kwargs: Any) -> dict[str, Any]:
        self.invocations.append(kwargs)
        raise AssertionError("passive runs must not invoke the agent")

    def start_batch_evaluation(self, **kwargs: Any) -> dict[str, Any]:
        self.batch_calls.append(kwargs)
        return {"batchEvaluationId": "be-passive-1"}

    def get_batch_evaluation(self, **kwargs: Any) -> dict[str, Any]:
        return {
            "status": "COMPLETED",
            "evaluationResults": {
                "evaluatorSummaries": [
                    {
                        "evaluatorId": "Builtin.Helpfulness",
                        "statistics": {"averageScore": 0.9},
                    }
                ]
            },
        }


def _wait_job(client: TestClient, job_id: str) -> dict[str, Any]:
    for _ in range(200):
        status = client.get(f"/api/jobs/{job_id}").json()
        if status["state"] in ("completed", "failed"):
            return status
        time.sleep(0.02)
    raise AssertionError("job did not finish")


def _patch(monkeypatch: pytest.MonkeyPatch) -> FakeDataClient:
    from app.routers import runs as runs_router

    fake = FakeDataClient()
    monkeypatch.setattr(runs_router, "get_session", lambda _c: None)
    monkeypatch.setattr(runs_router, "data", lambda _s: fake)
    monkeypatch.setattr(runs_router, "_sleep", lambda _s: None)
    return fake


def _external_agent(client: TestClient) -> str:
    return client.post(
        "/api/agents",
        json={
            "name": "Ext",
            "kind": "external",
            "binding": {"serviceName": "ext-svc", "logGroup": "/ext/lg"},
        },
    ).json()["id"]


def _deployed_agent(client: TestClient) -> str:
    agent = client.post("/api/agents", json={"name": "M", "code": "c"}).json()
    from app import db

    db.update_agent_deployment(
        agent["id"],
        {
            "status": "deployed",
            "runtimeArn": "arn:aws:bedrock-agentcore:::runtime/r-1",
            "runtimeId": "r-1",
            "logGroup": "/aws/bedrock-agentcore/runtimes/r-1-DEFAULT",
            "serviceName": "M1.DEFAULT",
            "region": "us-west-2",
        },
    )
    return agent["id"]


def test_lookback_run_on_external_agent(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = _patch(monkeypatch)
    agent_id = _external_agent(client)
    resp = client.post("/api/runs", json={"agentId": agent_id, "lookbackHours": 2})
    assert resp.status_code == 201
    body = resp.json()
    status = _wait_job(client, body["jobId"])
    assert status["state"] == "completed", status.get("error")

    # No traffic was generated.
    assert fake.invocations == []

    kwargs = fake.batch_calls[0]
    cw = kwargs["dataSourceConfig"]["cloudWatchLogs"]
    assert cw["serviceNames"] == ["ext-svc"]
    assert cw["logGroupNames"] == ["aws/spans", "/ext/lg"]
    tr = cw["filterConfig"]["timeRange"]
    assert "sessionIds" not in cw["filterConfig"]
    assert (tr["endTime"] - tr["startTime"]).total_seconds() == 2 * 3600
    assert tr["endTime"].tzinfo is not None

    import re

    assert re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_]{0,47}", kwargs["batchEvaluationName"])

    run = client.get(f"/api/runs/{body['runId']}").json()
    assert run["status"] == "completed"
    assert run["source"] == "lookback:2"
    assert run["datasetName"] == ""
    assert run["scores"] == [{"evaluatorId": "Builtin.Helpfulness", "score": 0.9}]


def test_session_ids_run(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _patch(monkeypatch)
    agent_id = _external_agent(client)
    resp = client.post(
        "/api/runs", json={"agentId": agent_id, "sessionIds": ["s-a", "s-b"]}
    )
    assert resp.status_code == 201
    body = resp.json()
    assert _wait_job(client, body["jobId"])["state"] == "completed"

    cw = fake.batch_calls[0]["dataSourceConfig"]["cloudWatchLogs"]
    assert cw["filterConfig"]["sessionIds"] == ["s-a", "s-b"]
    assert "timeRange" not in cw["filterConfig"]

    run = client.get(f"/api/runs/{body['runId']}").json()
    assert run["source"] == "sessions:2"
    assert run["sessionIds"] == ["s-a", "s-b"]


def test_scope_exactly_one(client: TestClient) -> None:
    agent_id = _external_agent(client)
    # zero scopes
    assert client.post("/api/runs", json={"agentId": agent_id}).status_code == 422
    # two scopes
    assert (
        client.post(
            "/api/runs",
            json={"agentId": agent_id, "lookbackHours": 2, "sessionIds": ["x"]},
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/runs",
            json={"agentId": agent_id, "datasetId": "d", "lookbackHours": 2},
        ).status_code
        == 422
    )


def test_lookback_bounds(client: TestClient) -> None:
    agent_id = _external_agent(client)
    assert (
        client.post("/api/runs", json={"agentId": agent_id, "lookbackHours": 0}).status_code
        == 422
    )
    assert (
        client.post("/api/runs", json={"agentId": agent_id, "lookbackHours": 337}).status_code
        == 422
    )


def test_passive_run_on_managed_deployed_agent(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = _patch(monkeypatch)
    agent_id = _deployed_agent(client)
    resp = client.post("/api/runs", json={"agentId": agent_id, "lookbackHours": 24})
    assert resp.status_code == 201
    assert _wait_job(client, resp.json()["jobId"])["state"] == "completed"

    cw = fake.batch_calls[0]["dataSourceConfig"]["cloudWatchLogs"]
    assert cw["serviceNames"] == ["M1.DEFAULT"]
    assert cw["logGroupNames"] == [
        "aws/spans",
        "/aws/bedrock-agentcore/runtimes/r-1-DEFAULT",
    ]


def test_passive_run_requires_telemetry(client: TestClient) -> None:
    # Managed agent, never deployed, no binding → 400.
    agent = client.post("/api/agents", json={"name": "M", "code": "c"}).json()
    resp = client.post("/api/runs", json={"agentId": agent["id"], "lookbackHours": 2})
    assert resp.status_code == 400
    assert "telemetry binding" in resp.json()["detail"]


def test_external_agent_dataset_requires_invoke_binding(client: TestClient) -> None:
    agent_id = _external_agent(client)
    dataset = client.post(
        "/api/datasets", json={"name": "DS", "items": [{"prompt": "p"}]}
    ).json()
    resp = client.post(
        "/api/runs", json={"agentId": agent_id, "datasetId": dataset["id"]}
    )
    assert resp.status_code == 400
    assert "invoke binding" in resp.json()["detail"]
