"""Scenario-aware runs: multi-turn sessions, ground truth, user simulation."""

from __future__ import annotations

import importlib
import io
import json
import time
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.simulation import run_simulated_scenario


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
    def __init__(self) -> None:
        self.invocations: list[dict[str, Any]] = []
        self.batch_calls: list[dict[str, Any]] = []

    def invoke_agent_runtime(self, **kwargs: Any) -> dict[str, Any]:
        self.invocations.append(kwargs)
        return {"response": io.BytesIO(b'"agent says hi"')}

    def sent(self) -> list[tuple[str, str]]:
        """[(sessionId, prompt)] in invocation order."""
        return [
            (i["runtimeSessionId"], json.loads(i["payload"])["prompt"])
            for i in self.invocations
        ]

    def start_batch_evaluation(self, **kwargs: Any) -> dict[str, Any]:
        self.batch_calls.append(kwargs)
        return {"batchEvaluationId": "be-1"}

    def get_batch_evaluation(self, **kwargs: Any) -> dict[str, Any]:
        return {"status": "COMPLETED", "evaluationResults": {"evaluatorSummaries": []}}


class ScriptedBedrock:
    """Actor LLM stub: returns the scripted replies in order."""

    def __init__(self, replies: list[str]) -> None:
        self.replies = list(replies)
        self.calls: list[dict[str, Any]] = []

    def converse(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(kwargs)
        text = self.replies.pop(0) if self.replies else json.dumps(
            {"reasoning": "", "message": "again", "stop": False}
        )
        return {"output": {"message": {"content": [{"text": text}]}}}


def _actor(reasoning: str, message: str, stop: bool) -> str:
    return json.dumps({"reasoning": reasoning, "message": message, "stop": stop})


def _wait_job(client: TestClient, job_id: str) -> dict[str, Any]:
    for _ in range(200):
        status = client.get(f"/api/jobs/{job_id}").json()
        if status["state"] in ("completed", "failed"):
            return status
        time.sleep(0.02)
    raise AssertionError("job did not finish")


def _seed_agent(client: TestClient) -> str:
    agent = client.post("/api/agents", json={"name": "A", "code": "x"}).json()
    from app import db

    db.update_agent_deployment(
        agent["id"],
        {
            "status": "deployed",
            "runtimeArn": "arn:aws:bedrock-agentcore:::runtime/r-9",
            "runtimeId": "r-9",
            "logGroup": "/aws/bedrock-agentcore/runtimes/r-9-DEFAULT",
            "serviceName": "A123.DEFAULT",
            "roleName": "role",
            "region": "us-west-2",
        },
    )
    return agent["id"]


def _patch(monkeypatch: pytest.MonkeyPatch, fake: FakeDataClient, bedrock: Any = None):
    from app.routers import runs as runs_router

    monkeypatch.setattr(runs_router, "get_session", lambda _c: None)
    monkeypatch.setattr(runs_router, "data", lambda _s: fake)
    monkeypatch.setattr(runs_router, "bedrock_runtime", lambda _s: bedrock)
    monkeypatch.setattr(runs_router, "_sleep", lambda _n: None)


PREDEFINED_DS = {
    "name": "scenario ds",
    "kind": "predefined",
    "scenarios": [
        {
            "scenario_id": "s1",
            "turns": [
                {"input": "first question", "expected_response": "the answer"},
                {"input": "second question"},
            ],
            "expected_trajectory": ["tool_a"],
            "assertions": ["did the thing"],
        },
        {"scenario_id": "s2", "turns": [{"input": "solo question"}]},
    ],
}

SIMULATED_DS = {
    "name": "sim ds",
    "kind": "simulated",
    "scenarios": [
        {
            "scenario_id": "persona-1",
            "actor_profile": {"context": "an employee", "goal": "book leave"},
            "input": "I need time off",
            "max_turns": 4,
            "assertions": ["leave was booked"],
        }
    ],
}


# ─── Criterion 1: predefined turns → one session, sequential order ───────────
def test_predefined_multi_turn_single_session(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = FakeDataClient()
    _patch(monkeypatch, fake)
    agent_id = _seed_agent(client)
    ds = client.post("/api/datasets", json=PREDEFINED_DS).json()

    body = client.post("/api/runs", json={"agentId": agent_id, "datasetId": ds["id"]}).json()
    assert _wait_job(client, body["jobId"])["state"] == "completed"

    sent = fake.sent()
    assert [p for _, p in sent] == ["first question", "second question", "solo question"]
    # Turns 1+2 share scenario s1's session; s2 gets its own.
    assert sent[0][0] == sent[1][0]
    assert sent[2][0] != sent[0][0]

    run = client.get(f"/api/runs/{body['runId']}").json()
    assert len(run["sessionIds"]) == 2  # one per scenario, not per turn


# ─── Criterion 3: sessionMetadata mapping ────────────────────────────────────
def test_ground_truth_session_metadata(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = FakeDataClient()
    _patch(monkeypatch, fake)
    agent_id = _seed_agent(client)
    ds = client.post("/api/datasets", json=PREDEFINED_DS).json()

    body = client.post("/api/runs", json={"agentId": agent_id, "datasetId": ds["id"]}).json()
    assert _wait_job(client, body["jobId"])["state"] == "completed"

    kwargs = fake.batch_calls[0]
    run = client.get(f"/api/runs/{body['runId']}").json()
    md = kwargs["evaluationMetadata"]["sessionMetadata"]
    # Only s1 carries ground truth; it maps to the FIRST session id.
    assert md == [
        {
            "sessionId": run["sessionIds"][0],
            "testScenarioId": "s1",
            "groundTruth": {
                "inline": {
                    "assertions": [{"text": "did the thing"}],
                    "expectedTrajectory": {"toolNames": ["tool_a"]},
                    "turns": [
                        {
                            "input": {"prompt": "first question"},
                            "expectedResponse": {"text": "the answer"},
                        }
                    ],
                }
            },
        }
    ]


# ─── Criterion 4: legacy payload regression (no evaluationMetadata) ──────────
def test_legacy_run_payload_unchanged(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = FakeDataClient()
    _patch(monkeypatch, fake)
    agent_id = _seed_agent(client)
    ds = client.post(
        "/api/datasets",
        json={"name": "L", "items": [{"prompt": "p1", "context": "Employee ID: EMP-001."}]},
    ).json()

    body = client.post("/api/runs", json={"agentId": agent_id, "datasetId": ds["id"]}).json()
    assert _wait_job(client, body["jobId"])["state"] == "completed"

    assert [p for _, p in fake.sent()] == ["Employee ID: EMP-001. p1"]
    kwargs = fake.batch_calls[0]
    assert "evaluationMetadata" not in kwargs
    assert set(kwargs) == {
        "batchEvaluationName",
        "evaluators",
        "dataSourceConfig",
        "clientToken",
    }
    run = client.get(f"/api/runs/{body['runId']}").json()
    assert run["transcripts"] is None


# ─── Criterion 2: simulation loop stop conditions (unit level) ───────────────
def _invoke_recorder(replies: list[tuple[str, str]]):
    def invoke(session_id: str, prompt: str) -> str:
        replies.append((session_id, prompt))
        return f"agent reply {len(replies)}"

    return invoke


def test_simulation_stops_on_goal() -> None:
    sent: list[tuple[str, str]] = []
    bedrock = ScriptedBedrock(
        [
            _actor("need more info", "what about Monday?", False),
            _actor("goal met", "", True),
        ]
    )
    scenario = {
        "scenario_id": "s",
        "actor_profile": {"context": "c", "goal": "g"},
        "input": "hello",
        "max_turns": 10,
    }
    result = run_simulated_scenario(
        _invoke_recorder(sent), scenario, bedrock_client=bedrock, session_id="sid"
    )
    assert result["stopped_by"] == "goal"
    assert result["turns"] == 2
    assert [p for _, p in sent] == ["hello", "what about Monday?"]
    # All turns share the given session id.
    assert {s for s, _ in sent} == {"sid"}
    roles = [t["role"] for t in result["transcript"]]
    assert roles == ["user", "agent", "actor_reasoning", "user", "agent", "actor_reasoning"]


def test_simulation_stops_at_max_turns() -> None:
    sent: list[tuple[str, str]] = []
    bedrock = ScriptedBedrock([])  # never stops
    scenario = {
        "scenario_id": "s",
        "actor_profile": {"context": "c", "goal": "g"},
        "input": "hello",
        "max_turns": 3,
    }
    result = run_simulated_scenario(
        _invoke_recorder(sent), scenario, bedrock_client=bedrock, session_id="sid"
    )
    assert result["stopped_by"] == "max_turns"
    assert result["turns"] == 3
    assert len(sent) == 3


def test_simulation_parse_error_stops_gracefully() -> None:
    sent: list[tuple[str, str]] = []
    bedrock = ScriptedBedrock(["THIS IS NOT JSON {"])
    scenario = {
        "scenario_id": "s",
        "actor_profile": {"context": "c", "goal": "g"},
        "input": "hello",
        "max_turns": 5,
    }
    result = run_simulated_scenario(
        _invoke_recorder(sent), scenario, bedrock_client=bedrock, session_id="sid"
    )
    assert result["stopped_by"] == "parse_error"
    assert result["transcript"][-1]["role"] == "actor_reasoning"
    assert "not valid JSON" in result["transcript"][-1]["text"]


def test_simulation_no_message_is_implicit_stop() -> None:
    sent: list[tuple[str, str]] = []
    bedrock = ScriptedBedrock([_actor("nothing more to say", "", False)])
    scenario = {
        "scenario_id": "s",
        "actor_profile": {"context": "c", "goal": "g"},
        "input": "hello",
        "max_turns": 5,
    }
    result = run_simulated_scenario(
        _invoke_recorder(sent), scenario, bedrock_client=bedrock, session_id="sid"
    )
    assert result["stopped_by"] == "no_message"


def test_simulation_hard_cap_at_20() -> None:
    sent: list[tuple[str, str]] = []
    bedrock = ScriptedBedrock([])
    scenario = {
        "scenario_id": "s",
        "actor_profile": {"context": "c", "goal": "g"},
        "input": "hello",
        "max_turns": 99,  # not producible via the API, but the loop still caps
    }
    result = run_simulated_scenario(
        _invoke_recorder(sent), scenario, bedrock_client=bedrock, session_id="sid"
    )
    assert result["turns"] == 20


# ─── Criterion 5 + 6: end-to-end simulated run ───────────────────────────────
def test_simulated_run_end_to_end(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = FakeDataClient()
    bedrock = ScriptedBedrock(
        [
            _actor("agent asked for dates", "next Monday to Wednesday", False),
            _actor("booked, done", "", True),
        ]
    )
    _patch(monkeypatch, fake, bedrock)
    agent_id = _seed_agent(client)
    ds = client.post("/api/datasets", json=SIMULATED_DS).json()

    body = client.post(
        "/api/runs",
        json={"agentId": agent_id, "datasetId": ds["id"], "simulationModelId": "my.model-id"},
    ).json()
    assert _wait_job(client, body["jobId"])["state"] == "completed"

    # Actor model id passed through to converse.
    assert all(c["modelId"] == "my.model-id" for c in bedrock.calls)

    run = client.get(f"/api/runs/{body['runId']}").json()
    assert run["transcripts"] is not None
    t = run["transcripts"][0]
    assert t["scenario_id"] == "persona-1"
    assert t["stopped_by"] == "goal"
    assert any(e["role"] == "actor_reasoning" for e in t["transcript"])

    # Ground truth (assertions) still flows for simulated scenarios.
    md = fake.batch_calls[0]["evaluationMetadata"]["sessionMetadata"]
    assert md[0]["testScenarioId"] == "persona-1"
    assert md[0]["groundTruth"]["inline"] == {"assertions": [{"text": "leave was booked"}]}


def test_simulated_default_model_id(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.simulation import DEFAULT_ACTOR_MODEL_ID

    fake = FakeDataClient()
    bedrock = ScriptedBedrock([_actor("", "", True)])
    _patch(monkeypatch, fake, bedrock)
    agent_id = _seed_agent(client)
    ds = client.post("/api/datasets", json=SIMULATED_DS).json()

    body = client.post("/api/runs", json={"agentId": agent_id, "datasetId": ds["id"]}).json()
    assert _wait_job(client, body["jobId"])["state"] == "completed"
    assert bedrock.calls[0]["modelId"] == DEFAULT_ACTOR_MODEL_ID


def test_simulated_run_requires_invoker(client: TestClient) -> None:
    # Registered but undeployed managed agent → 400 (existing invoker gate).
    agent = client.post("/api/agents", json={"name": "A", "code": "x"}).json()
    ds = client.post("/api/datasets", json=SIMULATED_DS).json()
    resp = client.post("/api/runs", json={"agentId": agent["id"], "datasetId": ds["id"]})
    assert resp.status_code == 400
