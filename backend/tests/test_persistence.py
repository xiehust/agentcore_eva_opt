"""Persistence tests: jobs + session state survive a simulated backend restart."""

from __future__ import annotations

import importlib

import pytest


@pytest.fixture()
def fresh_db(monkeypatch: pytest.MonkeyPatch, tmp_path):  # type: ignore[no-untyped-def]
    """Point the DB at a temp file and reload the db module for isolation."""
    dbfile = tmp_path / "test.db"
    monkeypatch.setenv("LAB4_DB_PATH", str(dbfile))
    from app import db

    db.reset_for_tests()
    importlib.reload(db)
    db.reset_for_tests()
    db.init()
    yield db
    db.reset_for_tests()


def test_job_persists_and_survives_restart(fresh_db) -> None:  # type: ignore[no-untyped-def]
    db = fresh_db
    db.upsert_job("job-1", state="completed", result={"runtime_arn": "arn:aws:x"})

    # Simulate a restart: drop the cached connection, reconnect to the same file.
    db.reset_for_tests()
    row = db.get_job("job-1")
    assert row is not None
    assert row["state"] == "completed"
    assert row["result"] == {"runtime_arn": "arn:aws:x"}


def test_job_upsert_updates_in_place(fresh_db) -> None:  # type: ignore[no-untyped-def]
    db = fresh_db
    db.upsert_job("job-2", state="pending")
    db.upsert_job("job-2", state="running", progress="deploying")
    db.upsert_job("job-2", state="completed", result={"ok": True})
    row = db.get_job("job-2")
    assert row["state"] == "completed"
    assert row["result"] == {"ok": True}


def test_session_state_round_trip_and_delete(fresh_db) -> None:  # type: ignore[no-untyped-def]
    db = fresh_db
    snapshot = {"mode": "live", "activeStep": "deploy", "artifacts": {"suffix": "abc"}}
    db.save_session("sess-1", snapshot)

    db.reset_for_tests()  # simulate restart
    assert db.load_session("sess-1") == snapshot

    db.delete_session("sess-1")
    assert db.load_session("sess-1") is None


def test_jobs_module_rehydrates_from_db_after_cache_loss(fresh_db) -> None:  # type: ignore[no-untyped-def]
    """jobs.get() must fall back to the DB when the in-memory cache is empty."""
    from app import jobs

    jobs._jobs.clear()  # simulate a fresh process with an empty cache
    fresh_db.upsert_job("job-3", state="completed", result={"scores": [1, 2, 3]})

    status = jobs.get("job-3")
    assert status is not None
    assert status.state == "completed"
    assert status.result == {"scores": [1, 2, 3]}
