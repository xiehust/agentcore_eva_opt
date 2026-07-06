"""Weights update: the service rejects config updates unless the A/B test is
PAUSED or NOT_STARTED (found live 2026-07-05). The endpoint must pause a
RUNNING test, poll until the pause lands (it's async), update, then resume."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import abtest as abtest_router

client = TestClient(app)

VARIANTS = [
    {"name": "C", "weight": 50, "variantConfiguration": {"target": {"name": "t1x"}}},
    {"name": "T1", "weight": 50, "variantConfiguration": {"target": {"name": "t2y"}}},
]


class FakeData:
    """RUNNING test whose pause takes a couple of polls to land."""

    def __init__(self, initial: str = "RUNNING", pause_polls: int = 2) -> None:
        self.exec_status = initial
        self._pending: str | None = None
        self._polls_left = pause_polls
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def get_ab_test(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("get_ab_test", kwargs))
        # Async transition: the requested status lands after N polls.
        if self._pending and self._polls_left > 0:
            self._polls_left -= 1
            if self._polls_left == 0:
                self.exec_status = self._pending
                self._pending = None
        return {"executionStatus": self.exec_status, "status": "ACTIVE"}

    def update_ab_test(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("update_ab_test", kwargs))
        if "executionStatus" in kwargs:
            self._pending = kwargs["executionStatus"]
            self._polls_left = 2
            return {"status": "UPDATING"}
        # Weights update: reject unless paused (mirrors the real service).
        if self.exec_status not in ("PAUSED", "NOT_STARTED"):
            raise RuntimeError(
                "ValidationException: Config updates only allowed when "
                "execution status is PAUSED or NOT_STARTED"
            )
        return {"status": "ACTIVE"}


@pytest.fixture()
def fake(monkeypatch: pytest.MonkeyPatch):  # type: ignore[no-untyped-def]
    fd = FakeData()
    monkeypatch.setattr(abtest_router, "get_session", lambda _c: None)
    monkeypatch.setattr(abtest_router, "data", lambda _s: fd)
    monkeypatch.setattr(abtest_router.time, "sleep", lambda _s: None)
    return fd


def _post(body_extra: dict[str, Any] | None = None) -> Any:
    return client.post(
        "/api/abtest/ab-1/weights",
        json={"controlWeight": 50, "treatmentWeight": 50, "variants": VARIANTS,
              **(body_extra or {})},
    )


def test_running_test_is_paused_updated_and_resumed(fake: FakeData) -> None:
    resp = _post()
    assert resp.status_code == 200
    assert resp.json()["updated"] is True
    # Call order: pause → (polls) → weights update → resume.
    updates = [k for n, k in fake.calls if n == "update_ab_test"]
    assert updates[0] == {"abTestId": "ab-1", "executionStatus": "PAUSED"}
    assert "variants" in updates[1]
    assert updates[1]["variants"][0]["weight"] == 50
    assert updates[-1] == {"abTestId": "ab-1", "executionStatus": "RUNNING"}


def test_not_started_test_updates_without_pausing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fd = FakeData(initial="NOT_STARTED")
    monkeypatch.setattr(abtest_router, "get_session", lambda _c: None)
    monkeypatch.setattr(abtest_router, "data", lambda _s: fd)
    resp = _post()
    assert resp.status_code == 200
    updates = [k for n, k in fd.calls if n == "update_ab_test"]
    # Only the weights update — no pause/resume churn.
    assert len(updates) == 1
    assert "variants" in updates[0]
