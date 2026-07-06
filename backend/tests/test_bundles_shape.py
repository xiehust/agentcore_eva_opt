"""Phase 2 tests: bundle payload shape, baggage header, compare, deploy job."""

from __future__ import annotations

import time
from typing import Any

from fastapi.testclient import TestClient

from app import agentcore
from app.main import app

client = TestClient(app)


class CapturingClient:
    """Stub bedrock-agentcore-control client that records the last call kwargs."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def create_configuration_bundle(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("create_configuration_bundle", kwargs))
        return {"bundleId": "bndl-test", "versionId": "ver-test", "bundleArn": "arn:aws:x"}


def test_create_bundle_carries_system_prompt_and_tools() -> None:
    cap = CapturingClient()
    agentcore.create_configuration_bundle(
        cap,
        agent_arn="arn:aws:agent",
        bundle_name="HRControl",
        system_prompt="You are a helpful HR Assistant.",
        tool_descriptions={"get_pto_balance": "Return PTO."},
        commit_message="control",
    )
    name, kwargs = cap.calls[-1]
    assert name == "create_configuration_bundle"
    cfg = kwargs["components"]["arn:aws:agent"]["configuration"]
    assert cfg["system_prompt"] == "You are a helpful HR Assistant."
    assert cfg["tool_descriptions"] == {"get_pto_balance": "Return PTO."}
    assert "clientToken" in kwargs  # idempotency token present


def test_baggage_header_format() -> None:
    baggage = agentcore.config_bundle_baggage("arn:aws:bundle", "ver-9")
    assert baggage == (
        "aws.agentcore.configbundle_arn=arn:aws:bundle,"
        "aws.agentcore.configbundle_version=ver-9"
    )


def test_compare_endpoint_reports_changes() -> None:
    resp = client.post(
        "/api/bundles/compare",
        json={
            "a": {"systemPrompt": "old", "toolDescriptions": {"t": "before"}},
            "b": {"systemPrompt": "new", "toolDescriptions": {"t": "after"}},
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["systemPromptChanged"] is True
    assert body["changedKeyCount"] == 2
    assert body["toolDiffs"][0] == {"tool": "t", "before": "before", "after": "after"}


def test_compare_endpoint_reports_no_change_when_equal() -> None:
    resp = client.post(
        "/api/bundles/compare",
        json={
            "a": {"systemPrompt": "same", "toolDescriptions": {"t": "x"}},
            "b": {"systemPrompt": "same", "toolDescriptions": {"t": "x"}},
        },
    )
    assert resp.json()["changedKeyCount"] == 0


def test_deploy_returns_job_and_reaches_terminal(monkeypatch: Any, tmp_path: Any) -> None:
    """With a fast stubbed deploy_agent.main, the job reaches completed."""
    import sys

    # Fake deploy_agent module writing a state file, so no Docker/AWS is touched.
    state_file = tmp_path / "agent_state_HRTest.json"
    state_file.write_text(
        '{"runtime_arn":"arn:aws:agent/HRTest","runtime_id":"HRTest",'
        '"log_group":"/aws/x","service_name":"HRTest","role_arn":"arn:role","region":"us-west-2"}'
    )

    import types

    fake = types.ModuleType("deploy_agent")
    fake.main = lambda **_kwargs: state_file  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "deploy_agent", fake)

    resp = client.post("/api/deploy", json={"name": "HRTest", "version": "v1"})
    assert resp.status_code == 200
    job_id = resp.json()["jobId"]

    # Poll the job to a terminal state.
    j: dict[str, Any] = {"state": "pending"}
    for _ in range(50):
        j = client.get(f"/api/jobs/{job_id}").json()
        if j["state"] in ("completed", "failed"):
            break
        time.sleep(0.05)
    assert j["state"] == "completed", j
    assert j["result"]["runtime_arn"] == "arn:aws:agent/HRTest"
