"""/invoke behavior with a stubbed query — no CLI subprocess, no Bedrock."""

from __future__ import annotations

from typing import Any

import pytest
from claude_agent_sdk import AssistantMessage, TextBlock
from fastapi.testclient import TestClient

from app import agent as agent_module
from app.main import app


def _fake_query(*texts: str):
    """An async-generator factory mimicking claude_agent_sdk.query."""

    async def fake(prompt: str, options: Any):
        yield AssistantMessage(
            content=[TextBlock(text=t) for t in texts], model="stub-model"
        )

    return fake


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    real_run_agent = agent_module.run_agent

    async def run_stub(prompt: str, *, query_fn: Any = None) -> str:
        return await real_run_agent(prompt, query_fn=_fake_query("The answer is 42."))

    monkeypatch.setattr("app.main.agent.run_agent", run_stub)
    return TestClient(app)


def test_healthz(client: TestClient) -> None:
    assert client.get("/healthz").json() == {"ok": True}


def test_invoke_echoes_session_id(client: TestClient) -> None:
    resp = client.post("/invoke", json={"prompt": "6*7?", "sessionId": "sess-42"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["sessionId"] == "sess-42"
    assert body["output"] == "The answer is 42."


def test_invoke_generates_session_id(client: TestClient) -> None:
    resp = client.post("/invoke", json={"prompt": "hi"})
    assert resp.status_code == 200
    sid = resp.json()["sessionId"]
    assert len(sid) == 36  # uuid4


def test_invoke_error_becomes_502(monkeypatch: pytest.MonkeyPatch) -> None:
    async def exploding(prompt: str, *, query_fn: Any = None) -> str:
        raise RuntimeError("bedrock unavailable")

    monkeypatch.setattr("app.main.agent.run_agent", exploding)
    client = TestClient(app)
    resp = client.post("/invoke", json={"prompt": "hi"})
    assert resp.status_code == 502
    assert "bedrock unavailable" in resp.json()["detail"]


async def test_run_agent_collects_text_blocks() -> None:
    out = await agent_module.run_agent("q", query_fn=_fake_query("part one", "part two"))
    assert out == "part one\npart two"
