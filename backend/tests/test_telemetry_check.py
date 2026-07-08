"""Telemetry verification: CloudWatch span probing against stub logs clients."""

from __future__ import annotations

import importlib
import json
import time
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import telemetry


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


def _span_message(
    *, service: str = "ext-svc", session_id: str | None = "sess-1", op: str | None = "chat"
) -> str:
    span: dict[str, Any] = {
        "name": f"{op} model" if op else "span",
        "attributes": {},
        "resource": {"attributes": {"service.name": service}},
        "endTimeUnixNano": 1_700_000_000_000,
    }
    if session_id:
        span["attributes"]["session.id"] = session_id
    if op:
        span["attributes"]["gen_ai.operation.name"] = op
    return json.dumps(span)


class StubLogs:
    def __init__(self, *, groups: list[str], events: list[str]) -> None:
        self.groups = groups
        self.events = events
        self.filter_calls: list[dict[str, Any]] = []
        self.describe_calls: list[dict[str, Any]] = []

    def describe_log_groups(self, **kwargs: Any) -> dict[str, Any]:
        self.describe_calls.append(kwargs)
        prefix = kwargs.get("logGroupNamePrefix", "")
        return {
            "logGroups": [
                {"logGroupName": g} for g in self.groups if g.startswith(prefix)
            ]
        }

    def filter_log_events(self, **kwargs: Any) -> dict[str, Any]:
        self.filter_calls.append(kwargs)
        return {"events": [{"message": m} for m in self.events]}


def test_report_happy_path() -> None:
    stub = StubLogs(
        groups=["/ext/lg", "aws/spans"],
        events=[
            _span_message(session_id="sess-1", op="invoke_agent"),
            _span_message(session_id="sess-2", op="chat"),
        ],
    )
    report = telemetry.telemetry_report(
        stub, service_name="ext-svc", log_group="/ext/lg", lookback_hours=24
    )
    assert report["ok"] is True
    assert report["logGroup"] == {"name": "/ext/lg", "exists": True}
    assert report["spans"]["spanCount"] == 2
    assert report["spans"]["sessionIdPresent"] is True
    assert report["spans"]["sessionIdSamples"] == ["sess-1", "sess-2"]
    assert report["spans"]["operationNames"] == ["chat", "invoke_agent"]
    assert report["hints"] == []


def test_report_zero_spans() -> None:
    stub = StubLogs(groups=["/ext/lg"], events=[])
    report = telemetry.telemetry_report(
        stub, service_name="ext-svc", log_group="/ext/lg"
    )
    assert report["ok"] is False
    assert report["spans"]["spanCount"] == 0
    assert any("service.name=ext-svc" in h for h in report["hints"])


def test_report_missing_session_id() -> None:
    stub = StubLogs(
        groups=["/ext/lg"], events=[_span_message(session_id=None)]
    )
    report = telemetry.telemetry_report(
        stub, service_name="ext-svc", log_group="/ext/lg"
    )
    assert report["ok"] is False
    assert report["spans"]["spanCount"] == 1
    assert report["spans"]["sessionIdSamples"] == []
    assert any("session.id" in h and "baggage" in h for h in report["hints"])


def test_report_missing_log_group_still_counts_spans() -> None:
    stub = StubLogs(groups=["aws/spans"], events=[_span_message()])
    report = telemetry.telemetry_report(
        stub, service_name="ext-svc", log_group="/missing/lg"
    )
    assert report["logGroup"]["exists"] is False
    assert report["spans"]["spanCount"] == 1
    assert any("/missing/lg" in h for h in report["hints"])
    # Missing agent log group alone does not fail the check.
    assert report["ok"] is True


def test_filter_pattern_and_lookback() -> None:
    stub = StubLogs(groups=[], events=[])
    before = time.time()
    telemetry.find_recent_spans(stub, service_name="ext-svc", lookback_hours=2)
    call = stub.filter_calls[0]
    assert call["logGroupName"] == "aws/spans"
    assert call["filterPattern"] == '"ext-svc"'
    # startTime ≈ now-2h in ms.
    expected = (before - 2 * 3600) * 1000
    assert abs(call["startTime"] - expected) < 5_000


def test_non_matching_and_unparseable_events_skipped() -> None:
    stub = StubLogs(
        groups=[],
        events=["not-json", json.dumps({"resource": {"attributes": {"service.name": "other"}}})],
    )
    spans = telemetry.find_recent_spans(stub, service_name="ext-svc")
    assert spans == []


def test_find_spans_follows_pagination() -> None:
    """aws/spans holds the whole account's spans: an empty page WITH a
    nextToken means keep scanning, not 'no matches'."""

    class PagedLogs(StubLogs):
        def filter_log_events(self, **kwargs: Any) -> dict[str, Any]:
            self.filter_calls.append(kwargs)
            if "nextToken" not in kwargs:
                return {"events": [], "nextToken": "page2"}  # empty first portion
            return {"events": [{"message": _span_message()}]}

    stub = PagedLogs(groups=[], events=[])
    spans = telemetry.find_recent_spans(stub, service_name="ext-svc")
    assert len(spans) == 1
    assert stub.filter_calls[1]["nextToken"] == "page2"


def test_endpoint_happy_path(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.routers import agents as agents_router

    stub = StubLogs(groups=["/ext/lg"], events=[_span_message()])
    monkeypatch.setattr(agents_router, "get_session", lambda _c: None)
    monkeypatch.setattr(agents_router, "logs", lambda _s: stub)

    agent = client.post(
        "/api/agents",
        json={
            "name": "Ext",
            "kind": "external",
            "binding": {"serviceName": "ext-svc", "logGroup": "/ext/lg"},
        },
    ).json()
    resp = client.post(f"/api/agents/{agent['id']}/telemetry-check", json={})
    assert resp.status_code == 200
    job_id = resp.json()["jobId"]
    for _ in range(200):
        status = client.get(f"/api/jobs/{job_id}").json()
        if status["state"] in ("completed", "failed"):
            break
        time.sleep(0.02)
    assert status["state"] == "completed"
    assert status["result"]["ok"] is True
    assert status["result"]["serviceName"] == "ext-svc"


def test_endpoint_validation(client: TestClient) -> None:
    # Undeployed managed agent without binding → 400.
    agent = client.post("/api/agents", json={"name": "M", "code": "c"}).json()
    resp = client.post(f"/api/agents/{agent['id']}/telemetry-check", json={})
    assert resp.status_code == 400
    assert "telemetry binding" in resp.json()["detail"]

    # Lookback bounds.
    ext = client.post(
        "/api/agents",
        json={
            "name": "E",
            "kind": "external",
            "binding": {"serviceName": "s", "logGroup": "/lg"},
        },
    ).json()
    bad = client.post(
        f"/api/agents/{ext['id']}/telemetry-check", json={"lookbackHours": 0}
    )
    assert bad.status_code == 422
