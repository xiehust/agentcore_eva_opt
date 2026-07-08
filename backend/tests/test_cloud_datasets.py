"""AWS cloud Dataset lifecycle against a stub control client."""

from __future__ import annotations

import importlib
import re
import time
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.agentcore import poll_dataset_active, sanitize_dataset_name


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


class FakeControlClient:
    """Captures create/list/get/delete dataset kwargs."""

    def __init__(self, statuses: list[str] | None = None) -> None:
        self.create_calls: list[dict[str, Any]] = []
        self.delete_calls: list[dict[str, Any]] = []
        self.get_calls: list[dict[str, Any]] = []
        self.list_calls: list[dict[str, Any]] = []
        self.statuses = statuses or ["ACTIVE"]
        self.pages: list[dict[str, Any]] | None = None

    def create_dataset(self, **kwargs: Any) -> dict[str, Any]:
        self.create_calls.append(kwargs)
        return {"datasetId": "cloud-ds-1", "status": "CREATING"}

    def get_dataset(self, **kwargs: Any) -> dict[str, Any]:
        self.get_calls.append(kwargs)
        status = self.statuses[min(len(self.get_calls) - 1, len(self.statuses) - 1)]
        out = {
            "datasetId": kwargs["datasetId"],
            "datasetArn": f"arn:aws:bedrock-agentcore:::dataset/{kwargs['datasetId']}",
            "datasetName": "my_dataset",
            "status": status,
            "schemaType": "AGENTCORE_EVALUATION_PREDEFINED_V1",
            "exampleCount": 3,
            "downloadUrl": "https://example.com/presigned",
        }
        if status == "CREATE_FAILED":
            out["failureReason"] = "bad example on line 2"
        return out

    def list_datasets(self, **kwargs: Any) -> dict[str, Any]:
        self.list_calls.append(kwargs)
        if self.pages is not None:
            return self.pages.pop(0)
        return {"datasets": [self.get_dataset(datasetId="cloud-ds-1")]}

    def delete_dataset(self, **kwargs: Any) -> dict[str, Any]:
        self.delete_calls.append(kwargs)
        return {"datasetId": kwargs["datasetId"], "status": "DELETING"}


def _wait_job(client: TestClient, job_id: str) -> dict[str, Any]:
    for _ in range(200):
        status = client.get(f"/api/jobs/{job_id}").json()
        if status["state"] in ("completed", "failed"):
            return status
        time.sleep(0.02)
    raise AssertionError("job did not finish")


def _patch(monkeypatch: pytest.MonkeyPatch, fake: FakeControlClient) -> None:
    from app.routers import datasets as datasets_router

    monkeypatch.setattr(datasets_router, "get_session", lambda _c: None)
    monkeypatch.setattr(datasets_router, "control", lambda _s: fake)


PREDEFINED = {
    "name": "My scenario-dataset!",
    "kind": "predefined",
    "scenarios": [
        {"scenario_id": "s1", "turns": [{"input": "q1"}], "assertions": ["a"]},
    ],
}

SIMULATED = {
    "name": "sim ds",
    "kind": "simulated",
    "scenarios": [
        {
            "scenario_id": "p1",
            "actor_profile": {"context": "c", "goal": "g"},
            "input": "hello",
        }
    ],
}


# ─── Criterion 1: schemaType per kind + examples pass-through ────────────────
def test_sync_predefined_schema_and_examples(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = FakeControlClient()
    _patch(monkeypatch, fake)
    ds = client.post("/api/datasets", json=PREDEFINED).json()

    job = client.post(f"/api/datasets/{ds['id']}/sync-to-aws", json={}).json()
    status = _wait_job(client, job["jobId"])
    assert status["state"] == "completed", status["error"]

    kwargs = fake.create_calls[0]
    assert kwargs["schemaType"] == "AGENTCORE_EVALUATION_PREDEFINED_V1"
    assert kwargs["source"]["inlineExamples"]["examples"] == PREDEFINED["scenarios"]
    assert re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_]{0,47}", kwargs["datasetName"])
    assert kwargs["clientToken"]

    # Criterion 6: cloud blob persisted on the local row.
    local = client.get(f"/api/datasets/{ds['id']}").json()
    assert local["cloud"]["datasetId"] == "cloud-ds-1"
    assert local["cloud"]["status"] == "ACTIVE"
    assert local["cloud"]["exampleCount"] == 3


def test_sync_simulated_schema_type(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = FakeControlClient()
    _patch(monkeypatch, fake)
    ds = client.post("/api/datasets", json=SIMULATED).json()
    job = client.post(f"/api/datasets/{ds['id']}/sync-to-aws", json={}).json()
    assert _wait_job(client, job["jobId"])["state"] == "completed"
    assert fake.create_calls[0]["schemaType"] == "AGENTCORE_EVALUATION_SIMULATED_V1"


# ─── Criterion 2: legacy sync sends normalized scenarios ─────────────────────
def test_sync_legacy_normalizes(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = FakeControlClient()
    _patch(monkeypatch, fake)
    ds = client.post(
        "/api/datasets",
        json={"name": "L", "items": [{"prompt": "p1", "context": "Employee ID: EMP-001."}]},
    ).json()
    job = client.post(f"/api/datasets/{ds['id']}/sync-to-aws", json={}).json()
    assert _wait_job(client, job["jobId"])["state"] == "completed"
    kwargs = fake.create_calls[0]
    assert kwargs["schemaType"] == "AGENTCORE_EVALUATION_PREDEFINED_V1"
    assert kwargs["source"]["inlineExamples"]["examples"] == [
        {"scenario_id": "item_1", "turns": [{"input": "Employee ID: EMP-001. p1"}]}
    ]


# ─── Criterion 3: name sanitization ──────────────────────────────────────────
def test_sanitize_dataset_name() -> None:
    for raw in ("我的-data set!", "123start", "---", "", "a" * 100):
        got = sanitize_dataset_name(raw)
        assert re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_]{0,47}", got), (raw, got)
    assert sanitize_dataset_name("My scenario-dataset!") == "My_scenario_dataset"
    assert len(sanitize_dataset_name("x" * 100)) == 48


# ─── Criterion 4: poll transitions ───────────────────────────────────────────
def test_poll_reaches_active() -> None:
    fake = FakeControlClient(statuses=["CREATING", "CREATING", "ACTIVE"])
    slept: list[float] = []
    result = poll_dataset_active(
        fake, dataset_id="cloud-ds-1", sleeper=slept.append
    )
    assert result["status"] == "ACTIVE"
    assert len(slept) == 2


def test_poll_create_failed_raises_with_reason() -> None:
    fake = FakeControlClient(statuses=["CREATING", "CREATE_FAILED"])
    with pytest.raises(RuntimeError, match="bad example on line 2"):
        poll_dataset_active(fake, dataset_id="cloud-ds-1", sleeper=lambda _s: None)


def test_sync_failure_surfaces_in_job_error(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = FakeControlClient(statuses=["CREATE_FAILED"])
    _patch(monkeypatch, fake)
    ds = client.post("/api/datasets", json=PREDEFINED).json()
    job = client.post(f"/api/datasets/{ds['id']}/sync-to-aws", json={}).json()
    status = _wait_job(client, job["jobId"])
    assert status["state"] == "failed"
    assert "bad example on line 2" in status["error"]


# ─── Criterion 5: cloud list/get/delete mapping + pagination ─────────────────
def test_cloud_list_mapping_and_pagination(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = FakeControlClient()
    fake.pages = [
        {
            "datasets": [
                {
                    "datasetId": "d1",
                    "datasetName": "one",
                    "status": "ACTIVE",
                    "schemaType": "AGENTCORE_EVALUATION_PREDEFINED_V1",
                    "exampleCount": 5,
                }
            ],
            "nextToken": "t1",
        },
        {"datasets": [{"datasetId": "d2", "datasetName": "two", "status": "CREATING"}]},
    ]
    _patch(monkeypatch, fake)
    rows = client.post("/api/datasets/cloud/list", json={}).json()["datasets"]
    assert [r["datasetId"] for r in rows] == ["d1", "d2"]
    assert rows[0]["name"] == "one"
    assert rows[0]["exampleCount"] == 5
    # Second page requested with the token.
    assert fake.list_calls[1] == {"nextToken": "t1"}


def test_cloud_get_includes_download_url(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = FakeControlClient()
    _patch(monkeypatch, fake)
    got = client.post("/api/datasets/cloud/cloud-ds-1/get", json={}).json()
    assert got["datasetId"] == "cloud-ds-1"
    assert got["downloadUrl"] == "https://example.com/presigned"


def test_cloud_delete_marks_local_copy(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = FakeControlClient()
    _patch(monkeypatch, fake)
    ds = client.post("/api/datasets", json=PREDEFINED).json()
    job = client.post(f"/api/datasets/{ds['id']}/sync-to-aws", json={}).json()
    assert _wait_job(client, job["jobId"])["state"] == "completed"

    resp = client.delete("/api/datasets/cloud/cloud-ds-1").json()
    assert resp == {"datasetId": "cloud-ds-1", "deleted": True}
    assert fake.delete_calls == [{"datasetId": "cloud-ds-1"}]
    local = client.get(f"/api/datasets/{ds['id']}").json()
    assert local["cloud"]["status"] == "deleted"
