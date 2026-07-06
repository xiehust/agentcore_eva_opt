"""Prompt formatting: generic context prefix generalizes the Employee-ID convention."""

from __future__ import annotations

from typing import Any

from app.models import format_prompt


def test_context_prefix_wins() -> None:
    assert (
        format_prompt("What is my PTO?", context="Customer tier: gold.", employee_id="EMP-001")
        == "Customer tier: gold. What is my PTO?"
    )


def test_legacy_employee_id_still_works() -> None:
    assert (
        format_prompt("What is my PTO?", employee_id="EMP-001")
        == "Employee ID: EMP-001. What is my PTO?"
    )


def test_bare_prompt_untouched() -> None:
    assert format_prompt("Hello") == "Hello"


def test_traffic_endpoint_applies_context(monkeypatch: Any, tmp_path: Any) -> None:
    """POST /api/traffic formats each prompt with its context prefix."""
    import importlib
    import time

    from fastapi.testclient import TestClient

    monkeypatch.setenv("LAB4_DB_PATH", str(tmp_path / "test.db"))
    from app import agentcore, db

    db.reset_for_tests()
    importlib.reload(db)
    db.reset_for_tests()
    db.init()
    from app.main import app
    from app.routers import deploy as deploy_router

    sent: list[dict[str, Any]] = []

    def fake_invoke(
        client: Any, *, agent_arn: str, session_id: str, prompt: str, baggage: Any = None
    ) -> str:
        sent.append({"agentArn": agent_arn, "sessionId": session_id, "prompt": prompt})
        return "ok"

    monkeypatch.setattr(agentcore, "invoke_agent_runtime", fake_invoke)
    monkeypatch.setattr(deploy_router, "get_session", lambda _c: None)
    monkeypatch.setattr(deploy_router, "data", lambda _s: None)

    client = TestClient(app)
    resp = client.post(
        "/api/traffic",
        json={
            "agentArn": "arn:x",
            "prompts": [
                {"prompt": "p1", "context": "Order #42."},
                {"prompt": "p2", "employeeId": "EMP-001"},
                {"prompt": "p3"},
            ],
        },
    )
    assert resp.status_code == 200
    job_id = resp.json()["jobId"]
    status: dict[str, Any] = {}
    for _ in range(100):
        status = client.get(f"/api/jobs/{job_id}").json()
        if status["state"] in ("completed", "failed"):
            break
        time.sleep(0.02)
    assert status["state"] == "completed", status.get("error")
    assert [s["prompt"] for s in sent] == [
        "Order #42. p1",
        "Employee ID: EMP-001. p2",
        "p3",
    ]
    db.reset_for_tests()
