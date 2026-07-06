"""Insights pipeline: start batch eval with insights → poll → parsed results.

Insights reuse the batch-evaluation API with `insights` INSTEAD of
`evaluators` (mutually exclusive), so the fakes assert the payload carries
insight ids and NO evaluators key.
"""

from __future__ import annotations

import importlib
import re
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


FAILURE_TREE = [
    {
        "clusterId": 1,
        "name": "Execution errors",
        "description": "Tool lookups failing",
        "affectedSessionCount": 5,
        "subCategories": [
            {
                "clusterId": 11,
                "name": "Resource not found",
                "affectedSessionCount": 5,
                "rootCauses": [
                    {
                        "name": "Unknown employee IDs",
                        "recommendation": "Validate IDs before lookup",
                        "affectedSessionCount": 5,
                        "affectedSessions": [{"sessionId": "s-1"}],
                    }
                ],
            }
        ],
    }
]


class FakeDataClient:
    def __init__(self) -> None:
        self.start_calls: list[dict[str, Any]] = []

    def start_batch_evaluation(self, **kwargs: Any) -> dict[str, Any]:
        self.start_calls.append(kwargs)
        return {"batchEvaluationId": "be-ins-1"}

    def get_batch_evaluation(self, **kwargs: Any) -> dict[str, Any]:
        return {
            "status": "COMPLETED",
            "failureAnalysisResult": {"failures": FAILURE_TREE},
            "userIntentResult": {
                "userIntents": [
                    {
                        "clusterId": 1,
                        "name": "PTO balance checks",
                        "description": "Users asking for PTO balances",
                        "affectedSessionCount": 4,
                        "affectedSessions": [
                            {"sessionId": "s-1", "userMessages": ["What is my PTO?"]}
                        ],
                    }
                ]
            },
            "executionSummaryResult": {
                "executionSummaries": [
                    {
                        "clusterId": 1,
                        "name": "Single tool lookup",
                        "description": "One lookup then answer",
                        "affectedSessionCount": 7,
                        "affectedSessions": [
                            {
                                "sessionId": "s-1",
                                "approachTaken": "called get_pto_balance",
                                "finalOutcome": "answered",
                            }
                        ],
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


def _seed(client: TestClient, *, deployed: bool = True) -> str:
    agent = client.post("/api/agents", json={"name": "A", "code": "print('x')"}).json()
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
    return agent["id"]


def _seed_run(client: TestClient, agent_id: str) -> str:
    from app import db

    db.create_run(
        "run-abc",
        agent_id=agent_id,
        dataset_id="ds-1",
        agent_name="A",
        dataset_name="DS",
        agent_arn="arn:x",
        evaluators=[],
        status="completed",
    )
    db.update_run("run-abc", session_ids=["s-1", "s-2", "s-3"])
    return "run-abc"


def _patch(monkeypatch: pytest.MonkeyPatch) -> FakeDataClient:
    from app.routers import insights as insights_router

    fake = FakeDataClient()
    monkeypatch.setattr(insights_router, "get_session", lambda _c: None)
    monkeypatch.setattr(insights_router, "data", lambda _s: fake)
    return fake


def test_run_scoped_report_happy_path(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = _patch(monkeypatch)
    agent_id = _seed(client)
    run_id = _seed_run(client, agent_id)

    resp = client.post("/api/insights", json={"agentId": agent_id, "runId": run_id})
    assert resp.status_code == 201
    body = resp.json()
    status = _wait_job(client, body["jobId"])
    assert status["state"] == "completed", status["error"]

    # Payload: insights (all three by default), NO evaluators, session filter.
    kwargs = fake.start_calls[0]
    assert re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_]{0,47}", kwargs["batchEvaluationName"])
    assert "evaluators" not in kwargs
    ids = [i["insightId"] for i in kwargs["insights"]]
    assert ids == [
        "Builtin.Insight.FailureAnalysis",
        "Builtin.Insight.UserIntent",
        "Builtin.Insight.ExecutionSummary",
    ]
    cw = kwargs["dataSourceConfig"]["cloudWatchLogs"]
    assert cw["serviceNames"] == ["A123.DEFAULT"]
    assert cw["filterConfig"]["sessionIds"] == ["s-1", "s-2", "s-3"]
    assert "timeRange" not in cw["filterConfig"]

    # Report row: completed with all three parsed trees.
    report = client.get(f"/api/insights/{body['reportId']}").json()
    assert report["status"] == "completed"
    assert report["source"] == f"run:{run_id}"
    assert report["batchEvaluationId"] == "be-ins-1"
    assert report["results"]["failures"][0]["name"] == "Execution errors"
    rc = report["results"]["failures"][0]["subCategories"][0]["rootCauses"][0]
    assert rc["recommendation"] == "Validate IDs before lookup"
    assert report["results"]["userIntents"][0]["name"] == "PTO balance checks"
    assert report["results"]["executionSummaries"][0]["affectedSessionCount"] == 7

    # History list, newest first.
    reports = client.get("/api/insights").json()["reports"]
    assert [r["id"] for r in reports] == [body["reportId"]]


def test_lookback_scoped_report_uses_time_range(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = _patch(monkeypatch)
    agent_id = _seed(client)

    resp = client.post(
        "/api/insights",
        json={
            "agentId": agent_id,
            "lookbackHours": 24,
            "insights": ["Builtin.Insight.FailureAnalysis"],
        },
    )
    assert resp.status_code == 201
    status = _wait_job(client, resp.json()["jobId"])
    assert status["state"] == "completed", status["error"]

    kwargs = fake.start_calls[0]
    ids = [i["insightId"] for i in kwargs["insights"]]
    assert ids == ["Builtin.Insight.FailureAnalysis"]
    fc = kwargs["dataSourceConfig"]["cloudWatchLogs"]["filterConfig"]
    assert "sessionIds" not in fc
    tr = fc["timeRange"]
    # datetimes (boto3 serializes) spanning ~24h.
    assert (tr["endTime"] - tr["startTime"]).total_seconds() == pytest.approx(
        24 * 3600, abs=5
    )

    report = client.get(f"/api/insights/{resp.json()['reportId']}").json()
    assert report["source"] == "agent"
    assert report["timeRange"]["startTime"] < report["timeRange"]["endTime"]


def test_scope_validation(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch(monkeypatch)
    agent_id = _seed(client)
    run_id = _seed_run(client, agent_id)

    # Neither or both scopes → 422.
    assert client.post("/api/insights", json={"agentId": agent_id}).status_code == 422
    assert (
        client.post(
            "/api/insights",
            json={"agentId": agent_id, "runId": run_id, "lookbackHours": 24},
        ).status_code
        == 422
    )
    # Bad lookback → 422.
    assert (
        client.post(
            "/api/insights", json={"agentId": agent_id, "lookbackHours": 0}
        ).status_code
        == 422
    )
    # Unknown insight id → 422.
    assert (
        client.post(
            "/api/insights",
            json={"agentId": agent_id, "runId": run_id, "insights": ["Builtin.Nope"]},
        ).status_code
        == 422
    )
    # Unknown agent/run → 404; undeployed agent → 400.
    assert (
        client.post("/api/insights", json={"agentId": "nope", "runId": run_id}).status_code
        == 404
    )
    assert (
        client.post(
            "/api/insights", json={"agentId": agent_id, "runId": "nope"}
        ).status_code
        == 404
    )
    undeployed = _seed(client, deployed=False)
    assert (
        client.post(
            "/api/insights", json={"agentId": undeployed, "runId": run_id}
        ).status_code
        == 400
    )


def test_failure_marks_report_failed(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.routers import insights as insights_router

    class ExplodingClient(FakeDataClient):
        def start_batch_evaluation(self, **kwargs: Any) -> dict[str, Any]:
            raise RuntimeError(
                "ConflictException: another batch evaluation is already active"
            )

    monkeypatch.setattr(insights_router, "get_session", lambda _c: None)
    monkeypatch.setattr(insights_router, "data", lambda _s: ExplodingClient())

    agent_id = _seed(client)
    run_id = _seed_run(client, agent_id)
    resp = client.post("/api/insights", json={"agentId": agent_id, "runId": run_id})
    body = resp.json()
    status = _wait_job(client, body["jobId"])
    assert status["state"] == "failed"

    report = client.get(f"/api/insights/{body['reportId']}").json()
    assert report["status"] == "failed"
    assert "ConflictException" in report["error"]


def test_incomplete_status_fails_report(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.routers import insights as insights_router

    class FailedEvalClient(FakeDataClient):
        def get_batch_evaluation(self, **kwargs: Any) -> dict[str, Any]:
            return {"status": "FAILED"}

    monkeypatch.setattr(insights_router, "get_session", lambda _c: None)
    monkeypatch.setattr(insights_router, "data", lambda _s: FailedEvalClient())

    agent_id = _seed(client)
    run_id = _seed_run(client, agent_id)
    resp = client.post("/api/insights", json={"agentId": agent_id, "runId": run_id})
    status = _wait_job(client, resp.json()["jobId"])
    assert status["state"] == "failed"
    report = client.get(f"/api/insights/{resp.json()['reportId']}").json()
    assert "FAILED" in report["error"]


def test_delete_report(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch(monkeypatch)
    agent_id = _seed(client)
    run_id = _seed_run(client, agent_id)
    resp = client.post("/api/insights", json={"agentId": agent_id, "runId": run_id})
    report_id = resp.json()["reportId"]
    _wait_job(client, resp.json()["jobId"])

    assert client.delete(f"/api/insights/{report_id}").status_code == 200
    assert client.get(f"/api/insights/{report_id}").status_code == 404
    assert client.delete(f"/api/insights/{report_id}").status_code == 404
