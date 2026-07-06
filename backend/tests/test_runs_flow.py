"""Runs pipeline: traffic → wait → batch eval → scores, all against fakes."""

from __future__ import annotations

import importlib
import io
import json
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
    """Captures invocations + batch-eval calls (single client, like the real one)."""

    def __init__(self) -> None:
        self.invocations: list[dict[str, Any]] = []
        self.batch_calls: list[dict[str, Any]] = []

    def invoke_agent_runtime(self, **kwargs: Any) -> dict[str, Any]:
        self.invocations.append(kwargs)
        return {"response": io.BytesIO(b'"ok"'), "contentType": "application/json"}

    def sent_prompts(self) -> list[str]:
        return [json.loads(i["payload"])["prompt"] for i in self.invocations]

    def start_batch_evaluation(self, **kwargs: Any) -> dict[str, Any]:
        self.batch_calls.append(kwargs)
        return {"batchEvaluationId": "be-run-1"}

    def get_batch_evaluation(self, **kwargs: Any) -> dict[str, Any]:
        return {
            "status": "COMPLETED",
            "evaluationResults": {
                "evaluatorSummaries": [
                    {
                        "evaluatorId": "Builtin.Helpfulness",
                        "statistics": {"averageScore": 0.82},
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


def _seed(client: TestClient, *, deployed: bool = True) -> tuple[str, str]:
    agent = client.post(
        "/api/agents",
        json={"name": "A", "code": "print('x')"},
    ).json()
    if deployed:
        from app import db

        db.update_agent_deployment(
            agent["id"],
            {
                "status": "deployed",
                "runtimeArn": "arn:aws:bedrock-agentcore:::runtime/r-9",
                "runtimeId": "r-9",
                "logGroup": "/aws/bedrock-agentcore/runtimes/r-9-DEFAULT",
                "serviceName": "A123.DEFAULT",
                "roleName": "BedrockAgentCore-A123",
                "region": "us-west-2",
            },
        )
    dataset = client.post(
        "/api/datasets",
        json={
            "name": "DS",
            "items": [
                {"prompt": "p1", "context": "Employee ID: EMP-001."},
                {"prompt": "p2"},
            ],
        },
    ).json()
    return agent["id"], dataset["id"]


def test_run_happy_path(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.routers import runs as runs_router

    fake = FakeDataClient()
    monkeypatch.setattr(runs_router, "get_session", lambda _c: None)
    monkeypatch.setattr(runs_router, "data", lambda _s: fake)
    slept: list[int] = []
    monkeypatch.setattr(runs_router, "_sleep", slept.append)

    agent_id, dataset_id = _seed(client)
    resp = client.post(
        "/api/runs",
        json={"agentId": agent_id, "datasetId": dataset_id, "waitSeconds": 77},
    )
    assert resp.status_code == 201
    body = resp.json()
    status = _wait_job(client, body["jobId"])
    assert status["state"] == "completed", status["error"]

    # Traffic: context applied, one session per item.
    assert fake.sent_prompts() == ["Employee ID: EMP-001. p1", "p2"]
    assert slept == [77]

    # Batch eval filtered to this run's sessions with the default trio.
    kwargs = fake.batch_calls[0]
    # AWS constraint: [a-zA-Z][a-zA-Z0-9_]{0,47} — hyphens are rejected.
    import re

    assert re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_]{0,47}", kwargs["batchEvaluationName"])
    cw = kwargs["dataSourceConfig"]["cloudWatchLogs"]
    assert cw["serviceNames"] == ["A123.DEFAULT"]
    assert cw["logGroupNames"] == ["aws/spans", "/aws/bedrock-agentcore/runtimes/r-9-DEFAULT"]
    assert len(cw["filterConfig"]["sessionIds"]) == 2
    ids = [e["evaluatorId"] for e in kwargs["evaluators"]]
    assert ids == ["Builtin.GoalSuccessRate", "Builtin.Helpfulness", "Builtin.Correctness"]

    # Run row: completed with scores, survives independently of the job store.
    run = client.get(f"/api/runs/{body['runId']}").json()
    assert run["status"] == "completed"
    assert run["scores"] == [{"evaluatorId": "Builtin.Helpfulness", "score": 0.82}]
    assert run["batchEvaluationId"] == "be-run-1"
    assert len(run["sessionIds"]) == 2

    # History list, newest first.
    runs = client.get("/api/runs").json()["runs"]
    assert [r["id"] for r in runs] == [body["runId"]]
    assert runs[0]["agentName"] == "A"
    assert runs[0]["datasetName"] == "DS"


def test_run_custom_evaluators_pass_through(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.routers import runs as runs_router

    fake = FakeDataClient()
    monkeypatch.setattr(runs_router, "get_session", lambda _c: None)
    monkeypatch.setattr(runs_router, "data", lambda _s: fake)
    monkeypatch.setattr(runs_router, "_sleep", lambda _s: None)

    agent_id, dataset_id = _seed(client)
    resp = client.post(
        "/api/runs",
        json={
            "agentId": agent_id,
            "datasetId": dataset_id,
            "evaluators": ["Builtin.Faithfulness", "custom-judge-1"],
            "waitSeconds": 0,
        },
    )
    _wait_job(client, resp.json()["jobId"])
    ids = [e["evaluatorId"] for e in fake.batch_calls[0]["evaluators"]]
    assert ids == ["Builtin.Faithfulness", "custom-judge-1"]


def test_run_requires_deployed_agent(client: TestClient) -> None:
    agent_id, dataset_id = _seed(client, deployed=False)
    resp = client.post("/api/runs", json={"agentId": agent_id, "datasetId": dataset_id})
    assert resp.status_code == 400
    assert "not deployed" in resp.json()["detail"]


def test_run_unknown_ids_404(client: TestClient) -> None:
    agent_id, dataset_id = _seed(client)
    assert (
        client.post("/api/runs", json={"agentId": "nope", "datasetId": dataset_id}).status_code
        == 404
    )
    assert (
        client.post("/api/runs", json={"agentId": agent_id, "datasetId": "nope"}).status_code
        == 404
    )


def test_run_failure_marks_row_failed(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.routers import runs as runs_router

    class ExplodingClient(FakeDataClient):
        def invoke_agent_runtime(self, **kwargs: Any) -> dict[str, Any]:
            raise RuntimeError("AccessDenied: boom")

    monkeypatch.setattr(runs_router, "get_session", lambda _c: None)
    monkeypatch.setattr(runs_router, "data", lambda _s: ExplodingClient())
    monkeypatch.setattr(runs_router, "_sleep", lambda _s: None)

    agent_id, dataset_id = _seed(client)
    resp = client.post("/api/runs", json={"agentId": agent_id, "datasetId": dataset_id})
    body = resp.json()
    status = _wait_job(client, body["jobId"])
    assert status["state"] == "failed"

    run = client.get(f"/api/runs/{body['runId']}").json()
    assert run["status"] == "failed"
    assert "AccessDenied" in run["error"]
