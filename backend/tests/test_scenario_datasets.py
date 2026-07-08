"""Scenario datasets: kind validation, migration, normalization, ground truth."""

from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient

from app.models import PredefinedScenario, SimulatedScenario
from app.scenarios import ground_truth_metadata, normalize_scenarios


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


PREDEFINED = {
    "name": "scenario ds",
    "kind": "predefined",
    "scenarios": [
        {
            "scenario_id": "s1",
            "turns": [
                {"input": "What is 15 + 27?", "expected_response": "15 + 27 = 42"},
                {"input": "And the weather?"},
            ],
            "expected_trajectory": ["calculator", "weather"],
            "assertions": ["Agent used the calculator tool"],
        }
    ],
}

SIMULATED = {
    "name": "sim ds",
    "kind": "simulated",
    "scenarios": [
        {
            "scenario_id": "geo-student",
            "actor_profile": {
                "context": "A student studying world geography",
                "goal": "Find out two capital cities",
                "traits": {"expertise": "novice"},
            },
            "input": "Hi! Can you help me learn capitals?",
            "max_turns": 5,
            "assertions": ["Agent provides accurate capital city information"],
        }
    ],
}


# ─── Criterion 1: predefined create + missing turns rejected ─────────────────
def test_predefined_create_and_read_back(client: TestClient) -> None:
    created = client.post("/api/datasets", json=PREDEFINED)
    assert created.status_code == 201
    ds = created.json()
    assert ds["kind"] == "predefined"
    assert ds["items"][0]["scenario_id"] == "s1"
    assert len(ds["items"][0]["turns"]) == 2


def test_predefined_without_turns_rejected(client: TestClient) -> None:
    bad = {
        "name": "bad",
        "kind": "predefined",
        "scenarios": [{"scenario_id": "s1", "assertions": ["x"]}],
    }
    assert client.post("/api/datasets", json=bad).status_code == 422


# ─── Criterion 2: simulated rejects trajectory/expected_response/max_turns ──
def test_simulated_rejects_expected_trajectory(client: TestClient) -> None:
    bad = {
        "name": "bad",
        "kind": "simulated",
        "scenarios": [
            {**SIMULATED["scenarios"][0], "expected_trajectory": ["tool_a"]}
        ],
    }
    assert client.post("/api/datasets", json=bad).status_code == 422


def test_simulated_max_turns_bounds(client: TestClient) -> None:
    for bad_turns in (0, 21):
        bad = {
            "name": "bad",
            "kind": "simulated",
            "scenarios": [{**SIMULATED["scenarios"][0], "max_turns": bad_turns}],
        }
        assert client.post("/api/datasets", json=bad).status_code == 422


def test_predefined_turn_rejects_extra_fields() -> None:
    with pytest.raises(ValueError):
        PredefinedScenario.model_validate(
            {
                "scenario_id": "s",
                "turns": [{"input": "hi", "actor_profile": {}}],
            }
        )


def test_simulated_scenario_validates() -> None:
    s = SimulatedScenario.model_validate(SIMULATED["scenarios"][0])
    assert s.max_turns == 5
    assert s.actor_profile.traits["expertise"] == "novice"


# ─── Criterion 3: legacy unchanged + migration default ───────────────────────
def test_legacy_create_without_kind(client: TestClient) -> None:
    created = client.post(
        "/api/datasets",
        json={"name": "legacy", "items": [{"prompt": "hi", "context": "EMP-1."}]},
    )
    assert created.status_code == 201
    assert created.json()["kind"] == "legacy"


def test_existing_rows_read_back_as_legacy(client: TestClient) -> None:
    # Direct db insert without kind kwarg — mirrors rows created pre-migration.
    from app import db

    db.create_dataset("oldrow", name="old", items=[{"prompt": "p"}])
    assert db.get_dataset("oldrow")["kind"] == "legacy"


def test_legacy_empty_items_rejected(client: TestClient) -> None:
    assert client.post("/api/datasets", json={"name": "x", "items": []}).status_code == 422


# ─── Criterion 4: normalize_scenarios ────────────────────────────────────────
def test_normalize_legacy_dataset() -> None:
    dataset = {
        "kind": "legacy",
        "items": [
            {"prompt": "What is my balance?", "context": "Employee ID: EMP-001."},
            {"prompt": "Plain question"},
        ],
    }
    scenarios = normalize_scenarios(dataset)
    assert scenarios == [
        {
            "scenario_id": "item_1",
            "turns": [{"input": "Employee ID: EMP-001. What is my balance?"}],
        },
        {"scenario_id": "item_2", "turns": [{"input": "Plain question"}]},
    ]


def test_normalize_passthrough_for_scenario_kinds() -> None:
    dataset = {"kind": "predefined", "items": PREDEFINED["scenarios"]}
    assert normalize_scenarios(dataset) is dataset["items"]


# ─── Criterion 5: ground_truth_metadata exact shape ──────────────────────────
def test_ground_truth_metadata_shape() -> None:
    scenarios = [
        {
            "scenario_id": "s1",
            "turns": [
                {"input": "q1", "expected_response": "a1"},
                {"input": "q2"},
            ],
            "expected_trajectory": ["calculator"],
            "assertions": ["did the thing"],
        },
        # No ground truth at all → omitted entirely.
        {"scenario_id": "s2", "turns": [{"input": "q"}]},
    ]
    md = ground_truth_metadata(scenarios, ["sid-1", "sid-2"])
    assert md == [
        {
            "sessionId": "sid-1",
            "testScenarioId": "s1",
            "groundTruth": {
                "inline": {
                    "assertions": [{"text": "did the thing"}],
                    "expectedTrajectory": {"toolNames": ["calculator"]},
                    "turns": [
                        {
                            "input": {"prompt": "q1"},
                            "expectedResponse": {"text": "a1"},
                        }
                    ],
                }
            },
        }
    ]


def test_ground_truth_metadata_partial_keys() -> None:
    scenarios = [{"scenario_id": "s", "turns": [{"input": "q"}], "assertions": ["a"]}]
    md = ground_truth_metadata(scenarios, ["sid"])
    inline = md[0]["groundTruth"]["inline"]
    assert set(inline) == {"assertions"}  # no empty trajectory/turns keys


# ─── Criterion 6: samples include the two new kinds and validate ─────────────
def test_samples_include_scenario_kinds(client: TestClient) -> None:
    datasets = client.get("/api/samples/datasets").json()["datasets"]
    by_key = {d["key"]: d for d in datasets}
    assert by_key["scenario"]["kind"] == "predefined"
    assert by_key["simulated"]["kind"] == "simulated"
    for s in by_key["scenario"]["items"]:
        PredefinedScenario.model_validate(s)
    for s in by_key["simulated"]["items"]:
        SimulatedScenario.model_validate(s)
    # Legacy samples carry no kind (frontend treats absent as legacy).
    assert "kind" not in by_key["baseline"]


def test_sample_scenarios_create_cleanly(client: TestClient) -> None:
    datasets = client.get("/api/samples/datasets").json()["datasets"]
    by_key = {d["key"]: d for d in datasets}
    for key in ("scenario", "simulated"):
        sample = by_key[key]
        resp = client.post(
            "/api/datasets",
            json={
                "name": sample["name"],
                "kind": sample["kind"],
                "scenarios": sample["items"],
            },
        )
        assert resp.status_code == 201, resp.text


# ─── Update flow for scenario kinds ──────────────────────────────────────────
def test_update_scenarios_validated_against_kind(client: TestClient) -> None:
    ds = client.post("/api/datasets", json=PREDEFINED).json()
    # Valid replacement works.
    ok = client.put(
        f"/api/datasets/{ds['id']}",
        json={"scenarios": [{"scenario_id": "s2", "turns": [{"input": "q"}]}]},
    )
    assert ok.status_code == 200
    assert ok.json()["items"][0]["scenario_id"] == "s2"
    # Simulated-shaped scenario rejected for a predefined dataset.
    bad = client.put(
        f"/api/datasets/{ds['id']}",
        json={"scenarios": SIMULATED["scenarios"]},
    )
    assert bad.status_code == 422
