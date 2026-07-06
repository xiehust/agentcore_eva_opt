"""Built-in samples: the HR agent code + baseline dataset endpoints."""

from __future__ import annotations

import re

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_sample_agent_is_the_real_hr_agent() -> None:
    resp = client.get("/api/samples/agent")
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"]
    assert body["requirements"] == []
    # Must be a deployable AgentCore app (entrypoint contract).
    assert "BedrockAgentCoreApp" in body["code"]
    assert "@app.entrypoint" in body["code"]
    # Config bundles only work if the code reads them at invoke time.
    assert "get_config_bundle" in body["code"]
    # Config: v1 prompt + the 5 short tool descriptions.
    config = body["config"]
    assert config["systemPrompt"].startswith("You are a helpful HR Assistant")
    assert len(config["toolDescriptions"]) == 5
    assert "get_pto_balance" in config["toolDescriptions"]


def test_sample_agent_v2_variant() -> None:
    resp = client.get("/api/samples/agent?variant=v2")
    assert resp.status_code == 200
    body = resp.json()
    assert "v2" in body["name"]
    # v2 = v1 + escalation tool, still a valid AgentCore app with the hook.
    assert "escalate_to_hr_manager" in body["code"]
    assert "@app.entrypoint" in body["code"]
    assert "get_config_bundle" in body["code"]
    config = body["config"]
    assert len(config["toolDescriptions"]) == 6
    assert "escalate_to_hr_manager" in config["toolDescriptions"]
    assert "v2" in config["systemPrompt"]


def test_sample_agent_unknown_variant_422() -> None:
    assert client.get("/api/samples/agent?variant=v9").status_code == 422


def test_sample_datasets_list() -> None:
    resp = client.get("/api/samples/datasets")
    assert resp.status_code == 200
    datasets = resp.json()["datasets"]
    by_key = {d["key"]: d for d in datasets}
    assert set(by_key) == {"baseline", "gateway", "target", "failure"}
    assert len(by_key["baseline"]["items"]) == 10
    assert len(by_key["gateway"]["items"]) == 20
    assert len(by_key["target"]["items"]) == 10
    assert len(by_key["failure"]["items"]) == 12
    for d in datasets:
        for item in d["items"]:
            assert item["prompt"]
            if "context" in item:
                assert re.fullmatch(r"Employee ID: EMP-\d{3}\.", item["context"])


def test_sample_dataset_shape() -> None:
    resp = client.get("/api/samples/dataset")
    assert resp.status_code == 200
    body = resp.json()
    items = body["items"]
    assert len(items) == 10
    for item in items:
        assert item["prompt"]
        assert re.fullmatch(r"Employee ID: EMP-\d{3}\.", item["context"])
