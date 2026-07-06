"""Phase 4 tests: A/B variant payloads, weights, cleanup fan-out, monitor mapping."""

from __future__ import annotations

from typing import Any

from app import agentcore


class CaptureData:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def create_ab_test(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("create_ab_test", kwargs))
        return {"abTestId": "ab-1"}

    def update_ab_test(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("update_ab_test", kwargs))
        return {"status": "ACTIVE"}


def test_config_bundle_variants_payload() -> None:
    variants = agentcore.config_bundle_variants("arnC", "vC", "arnT", "vT")
    assert variants[0]["name"] == "C" and variants[0]["weight"] == 50
    cb = variants[0]["variantConfiguration"]["configurationBundle"]
    assert cb == {"bundleArn": "arnC", "bundleVersion": "vC"}
    assert variants[1]["variantConfiguration"]["configurationBundle"]["bundleArn"] == "arnT"


def test_target_variants_payload_90_10() -> None:
    variants = agentcore.target_variants("HRAgentV1", "HRAgentV2")
    assert variants[0]["weight"] == 90
    assert variants[0]["variantConfiguration"]["target"]["name"] == "HRAgentV1"
    assert variants[1]["weight"] == 10
    assert variants[1]["variantConfiguration"]["target"]["name"] == "HRAgentV2"


def test_update_ab_test_weights() -> None:
    cap = CaptureData()
    variants = agentcore.target_variants("v1", "v2", 50, 50)
    agentcore.update_ab_test_weights(cap, ab_test_id="ab-1", variants=variants)
    name, kwargs = cap.calls[-1]
    assert name == "update_ab_test"
    assert kwargs["abTestId"] == "ab-1"
    assert kwargs["variants"][0]["weight"] == 50


def test_normalize_ab_results_shape() -> None:
    sample = {
        "results": {
            "analysisTimestamp": "2026-07-01T00:00:00Z",
            "evaluatorMetrics": [
                {
                    "evaluatorArn": "arn:.../Builtin.GoalSuccessRate",
                    "controlStats": {"name": "C", "mean": 0.72, "sampleSize": 40},
                    "variantResults": [
                        {
                            "name": "T1",
                            "mean": 0.86,
                            "sampleSize": 39,
                            "pValue": 0.018,
                            "percentChange": 19.4,
                            "isSignificant": True,
                        }
                    ],
                }
            ],
        }
    }
    metrics = agentcore.normalize_ab_results(sample)
    assert len(metrics) == 1
    m = metrics[0]
    assert m["label"] == "Builtin.GoalSuccessRate"
    assert m["control"]["mean"] == 0.72
    assert m["variants"][0]["isSignificant"] is True
    assert m["variants"][0]["percentChange"] == 19.4


def test_cleanup_fans_out_and_tolerates_failure() -> None:
    """A client that throws on one category still deletes/reports the rest."""

    class Ctrl:
        def __init__(self) -> None:
            self.deleted: list[str] = []

        def delete_configuration_bundle(self, bundleId: str) -> None:
            if bundleId == "boom":
                raise RuntimeError("cannot delete")
            self.deleted.append(f"bundle:{bundleId}")

        def delete_gateway(self, gatewayIdentifier: str) -> None:
            self.deleted.append(f"gateway:{gatewayIdentifier}")

        def delete_gateway_target(self, gatewayIdentifier: str, targetId: str) -> None:
            self.deleted.append(f"target:{targetId}")

        def delete_agent_runtime(self, agentRuntimeId: str) -> None:
            self.deleted.append(f"runtime:{agentRuntimeId}")

        def update_online_evaluation_config(self, **_kw: Any) -> None:
            pass

        def delete_online_evaluation_config(self, onlineEvaluationConfigId: str) -> None:
            self.deleted.append(f"oe:{onlineEvaluationConfigId}")

        def delete_evaluator(self, evaluatorId: str) -> None:
            self.deleted.append(f"evaluator:{evaluatorId}")

    class Data:
        def update_ab_test(self, **_kw: Any) -> None:
            pass

        def delete_ab_test(self, abTestId: str) -> None:
            pass

    class Logs:
        def delete_delivery(self, id: str) -> None:  # noqa: A002
            pass

    class Iam:
        def delete_role(self, RoleName: str) -> None:
            pass

    ctrl = Ctrl()
    results = agentcore.cleanup_resources(
        ctrl,
        Data(),
        ab_test_ids=["ab-1"],
        online_eval_ids=["oe-1"],
        evaluator_ids=["ev-1"],
        bundle_ids=["good", "boom"],  # "boom" raises
        gateway_id="gw-1",
        target_ids=["t-1", "t-2"],
        runtime_ids=["r-1"],
        role_name="BedrockAgentCore-X",
        delivery_id="d-1",
        logs_client=Logs(),
        iam_client=Iam(),
    )
    categories = {r["category"] for r in results}
    # ≥7 distinct categories attempted
    assert len(categories) >= 7
    # The failing bundle is reported skipped; the rest proceed.
    boom = next(r for r in results if r["category"] == "bundle:boom")
    assert boom["status"] == "skipped"
    assert "runtime:r-1" in categories
    assert "gateway" in categories
    assert "evaluator:ev-1" in categories
    assert "evaluator:ev-1" in ctrl.deleted


def test_cleanup_waits_for_targets_before_gateway_delete() -> None:
    """DeleteGateway rejects while targets exist; cleanup polls until drained."""

    class Ctrl:
        def __init__(self) -> None:
            self.calls: list[str] = []
            self.targets = ["t-1", "t-2"]

        def delete_gateway_target(self, gatewayIdentifier: str, targetId: str) -> None:
            self.calls.append(f"delete_target:{targetId}")

        def list_gateway_targets(self, gatewayIdentifier: str) -> dict[str, Any]:
            self.calls.append("list_targets")
            # Simulate async deletion: one target disappears per poll.
            items = [{"targetId": t} for t in self.targets]
            if self.targets:
                self.targets.pop()
            return {"items": items}

        def delete_gateway(self, gatewayIdentifier: str) -> None:
            assert not self.targets, "gateway deleted while targets remain"
            self.calls.append("delete_gateway")

    ctrl = Ctrl()
    results = agentcore.cleanup_resources(
        ctrl,
        None,
        gateway_id="gw-1",
        target_ids=["t-1", "t-2"],
        gateway_wait_interval=0.0,
    )
    assert ctrl.calls[-1] == "delete_gateway"
    assert ctrl.calls.count("list_targets") >= 2
    gw = next(r for r in results if r["category"] == "gateway")
    assert gw["status"] == "deleted"
