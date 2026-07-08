"""HTTP invoker: payload rendering, request shape, and dataset runs against
external agents (fake opener — no network)."""

from __future__ import annotations

import importlib
import io
import json
import time
import urllib.error
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import invokers


# ─── render_payload ──────────────────────────────────────────────────────────
def test_render_payload_default_template_survives_special_chars() -> None:
    tricky = 'He said "hi",\nthen 换行 & unicode ✓'
    body = invokers.render_payload(
        '{"prompt": {prompt}, "sessionId": {sessionId}}',
        prompt=tricky,
        session_id="s-1",
    )
    parsed = json.loads(body)
    assert parsed == {"prompt": tricky, "sessionId": "s-1"}


def test_render_payload_custom_template() -> None:
    body = invokers.render_payload(
        '{"input": {"text": {prompt}}, "meta": {"sid": {sessionId}, "v": 2}}',
        prompt="p",
        session_id="s",
    )
    assert json.loads(body) == {"input": {"text": "p"}, "meta": {"sid": "s", "v": 2}}


def test_render_payload_invalid_json_raises() -> None:
    with pytest.raises(ValueError, match="invalid JSON"):
        invokers.render_payload("{prompt}: {sessionId},,,", prompt="p", session_id="s")


# ─── invoke_http ─────────────────────────────────────────────────────────────
class FakeResponse:
    def __init__(self, body: bytes = b'{"output": "ok"}') -> None:
        self._body = body

    def read(self) -> bytes:
        return self._body

    def __enter__(self) -> FakeResponse:
        return self

    def __exit__(self, *exc: Any) -> None:
        return None


def test_invoke_http_request_shape() -> None:
    captured: dict[str, Any] = {}

    def opener(request: Any, timeout: float) -> FakeResponse:
        captured["request"] = request
        captured["timeout"] = timeout
        return FakeResponse()

    out = invokers.invoke_http(
        {
            "url": "https://agent.example/invoke",
            "sessionHeader": "X-My-Session",
            "headers": {"Authorization": "Bearer tok", "X-Extra": "1"},
            "timeoutSeconds": 30,
        },
        session_id="sess-9",
        prompt='say "hello"',
        opener=opener,
    )
    assert out == '{"output": "ok"}'
    req = captured["request"]
    assert req.full_url == "https://agent.example/invoke"
    assert req.get_method() == "POST"
    # urllib capitalizes header names.
    assert req.get_header("Content-type") == "application/json"
    assert req.get_header("X-my-session") == "sess-9"
    assert req.get_header("Authorization") == "Bearer tok"
    assert req.get_header("X-extra") == "1"
    assert captured["timeout"] == 30
    assert json.loads(req.data.decode()) == {"prompt": 'say "hello"', "sessionId": "sess-9"}


def test_invoke_http_defaults() -> None:
    captured: dict[str, Any] = {}

    def opener(request: Any, timeout: float) -> FakeResponse:
        captured["request"] = request
        captured["timeout"] = timeout
        return FakeResponse()

    invokers.invoke_http(
        {"url": "http://localhost:9100/invoke"},
        session_id="s",
        prompt="p",
        opener=opener,
    )
    assert captured["request"].get_header("X-session-id") == "s"
    assert captured["timeout"] == 60


def test_invoke_http_non_2xx_raises_with_excerpt() -> None:
    def opener(request: Any, timeout: float) -> FakeResponse:
        raise urllib.error.HTTPError(
            request.full_url, 502, "Bad Gateway", {}, io.BytesIO(b"upstream exploded")
        )

    with pytest.raises(RuntimeError, match="HTTP 502.*upstream exploded"):
        invokers.invoke_http(
            {"url": "https://agent.example/invoke"},
            session_id="s",
            prompt="p",
            opener=opener,
        )


# ─── resolve_invoker ─────────────────────────────────────────────────────────
def test_resolve_invoker_priorities() -> None:
    deployed = {"deployment": {"status": "deployed", "runtimeArn": "arn:r"}}
    external = {"binding": {"invoke": {"url": "https://x/invoke"}}}
    neither = {"binding": {"serviceName": "s", "logGroup": "/lg"}}
    assert invokers.resolve_invoker(deployed, object()) is not None
    assert invokers.resolve_invoker(external, None) is not None
    assert invokers.resolve_invoker(neither, None) is None


# ─── dataset run against an external agent (endpoint level) ─────────────────
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


class FakeEvalClient:
    def __init__(self) -> None:
        self.batch_calls: list[dict[str, Any]] = []

    def start_batch_evaluation(self, **kwargs: Any) -> dict[str, Any]:
        self.batch_calls.append(kwargs)
        return {"batchEvaluationId": "be-http-1"}

    def get_batch_evaluation(self, **kwargs: Any) -> dict[str, Any]:
        return {
            "status": "COMPLETED",
            "evaluationResults": {
                "evaluatorSummaries": [
                    {"evaluatorId": "Builtin.Helpfulness", "statistics": {"averageScore": 0.7}}
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


def test_dataset_run_against_external_agent(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.routers import runs as runs_router

    fake_eval = FakeEvalClient()
    requests: list[Any] = []

    def opener(request: Any, timeout: float) -> FakeResponse:
        requests.append(request)
        return FakeResponse()

    monkeypatch.setattr(runs_router, "get_session", lambda _c: None)
    monkeypatch.setattr(runs_router, "data", lambda _s: fake_eval)
    monkeypatch.setattr(runs_router, "_sleep", lambda _s: None)
    monkeypatch.setattr("app.invokers.urllib.request.urlopen", opener)

    agent = client.post(
        "/api/agents",
        json={
            "name": "Ext",
            "kind": "external",
            "binding": {
                "serviceName": "ext-svc",
                "logGroup": "/ext/lg",
                "invoke": {"url": "http://127.0.0.1:9100/invoke"},
            },
        },
    ).json()
    dataset = client.post(
        "/api/datasets",
        json={
            "name": "DS",
            "items": [{"prompt": "p1", "context": "Ctx."}, {"prompt": "p2"}, {"prompt": "p3"}],
        },
    ).json()

    resp = client.post(
        "/api/runs", json={"agentId": agent["id"], "datasetId": dataset["id"], "waitSeconds": 0}
    )
    assert resp.status_code == 201
    body = resp.json()
    status = _wait_job(client, body["jobId"])
    assert status["state"] == "completed", status.get("error")

    # 3 items → 3 HTTP invocations with 3 distinct session ids.
    assert len(requests) == 3
    sids = [r.get_header("X-session-id") for r in requests]
    assert len(set(sids)) == 3
    # Context prefix applied to the first prompt.
    assert json.loads(requests[0].data.decode())["prompt"] == "Ctx. p1"

    # Batch eval scoped to exactly those sessions, using the binding telemetry.
    kwargs = fake_eval.batch_calls[0]
    cw = kwargs["dataSourceConfig"]["cloudWatchLogs"]
    assert cw["serviceNames"] == ["ext-svc"]
    assert cw["logGroupNames"] == ["aws/spans", "/ext/lg"]
    assert sorted(cw["filterConfig"]["sessionIds"]) == sorted(sids)

    run = client.get(f"/api/runs/{body['runId']}").json()
    assert run["status"] == "completed"
    assert run["source"] == "dataset"
    assert run["agentArn"] is None


def test_dataset_run_http_error_marks_run_failed(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.routers import runs as runs_router

    def opener(request: Any, timeout: float) -> FakeResponse:
        raise urllib.error.HTTPError(
            request.full_url, 401, "Unauthorized", {}, io.BytesIO(b"bad token")
        )

    monkeypatch.setattr(runs_router, "get_session", lambda _c: None)
    monkeypatch.setattr(runs_router, "data", lambda _s: FakeEvalClient())
    monkeypatch.setattr(runs_router, "_sleep", lambda _s: None)
    monkeypatch.setattr("app.invokers.urllib.request.urlopen", opener)

    agent = client.post(
        "/api/agents",
        json={
            "name": "Ext",
            "kind": "external",
            "binding": {
                "serviceName": "s",
                "logGroup": "/lg",
                "invoke": {"url": "http://127.0.0.1:9100/invoke"},
            },
        },
    ).json()
    dataset = client.post(
        "/api/datasets", json={"name": "DS", "items": [{"prompt": "p"}]}
    ).json()
    resp = client.post("/api/runs", json={"agentId": agent["id"], "datasetId": dataset["id"]})
    status = _wait_job(client, resp.json()["jobId"])
    assert status["state"] == "failed"

    run = client.get(f"/api/runs/{resp.json()['runId']}").json()
    assert run["status"] == "failed"
    assert "HTTP 401" in run["error"]
    assert "bad token" in run["error"]
