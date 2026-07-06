"""Step 8b–d live orchestration: add v2 target + v2 online-eval, stop the bundle
A/B test (only one runs per gateway), then create the target A/B test.

The bug this guards: Step 8's setup had no live path, so `targetAbTestId` was
never produced and Step 8e's monitor threw "No target A/B test id".
"""

from __future__ import annotations

from typing import Any

from app.models import TargetSetupRequest
from app.routers.abtest import _target_ab_setup_run


class ConflictException(Exception):
    """Mimics botocore ConflictException (matched by class name)."""


class FakeControl:
    def __init__(self, conflict: set[str] | None = None) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.conflict = conflict or set()

    def _maybe(self, name: str) -> None:
        if name in self.conflict:
            raise ConflictException(f"{name} exists")

    def create_gateway_target(self, **kw: Any) -> dict[str, Any]:
        self.calls.append(("create_gateway_target", kw))
        self._maybe("create_gateway_target")
        return {"targetId": "tgt-v2-new"}

    def list_gateway_targets(self, **kw: Any) -> dict[str, Any]:
        return {"items": [{"targetId": "tgt-v2-existing", "name": "HRAgentV2"}]}

    def get_gateway_target(self, **kw: Any) -> dict[str, Any]:
        return {"status": "READY"}

    def create_online_evaluation_config(self, **kw: Any) -> dict[str, Any]:
        self.calls.append(("create_online_evaluation_config", kw))
        self._maybe("create_online_evaluation_config")
        return {
            "onlineEvaluationConfigArn": "arn:oe-v2",
            "onlineEvaluationConfigId": "oe-v2",
        }

    def list_online_evaluation_configs(self, **kw: Any) -> dict[str, Any]:
        return {
            "onlineEvaluationConfigs": [
                {
                    "onlineEvaluationConfigName": "HROnlineEvalV2abc",
                    "onlineEvaluationConfigArn": "arn:oe-v2-existing",
                    "onlineEvaluationConfigId": "oe-v2-existing",
                }
            ]
        }


class FakeData:
    def __init__(self, bundle_status: str = "RUNNING") -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.bundle_status = bundle_status

    def get_ab_test(self, **kw: Any) -> dict[str, Any]:
        self.calls.append(("get_ab_test", kw))
        return {"executionStatus": self.bundle_status}

    def update_ab_test(self, **kw: Any) -> dict[str, Any]:
        self.calls.append(("update_ab_test", kw))
        return {}

    def create_ab_test(self, **kw: Any) -> dict[str, Any]:
        self.calls.append(("create_ab_test", kw))
        return {"abTestId": "target-ab-1"}

    def list_ab_tests(self, **kw: Any) -> dict[str, Any]:
        return {"abTests": []}


def _req() -> TargetSetupRequest:
    return TargetSetupRequest(
        name="HRTargetABabc",
        gatewayId="gw-1",
        gatewayArn="arn:gw",
        roleArn="arn:role",
        agentArnV2="arn:aws:bedrock-agentcore:us-west-2:123:runtime/HRAssistV2-abc",
        targetNameV1="HRAgentV1",
        targetNameV2="HRAgentV2",
        onlineEvalNameV2="HROnlineEvalV2abc",
        logGroupV2="/aws/x/v2",
        serviceNameV2="HRAssistV2abc.DEFAULT",
        onlineEvalArnV1="arn:oe-v1",
        bundleAbTestId="bundle-ab-1",
    )


def _kw(calls: list[tuple[str, dict[str, Any]]], name: str) -> dict[str, Any]:
    return next(k for n, k in calls if n == name)


def test_happy_path_creates_v2_target_eval_stops_bundle_and_creates_target_ab() -> None:
    cc, dd = FakeControl(), FakeData(bundle_status="RUNNING")
    result = _target_ab_setup_run(_req(), cc, dd, lambda _m: None)

    # v2 target created with the v2 runtime arn as an http target
    tgt = _kw(cc.calls, "create_gateway_target")
    assert tgt["name"] == "HRAgentV2"
    assert tgt["targetConfiguration"]["http"]["agentcoreRuntime"]["arn"].endswith(
        "HRAssistV2-abc"
    )
    # bundle test stopped before creating the target test
    upd = _kw(dd.calls, "update_ab_test")
    assert upd["abTestId"] == "bundle-ab-1"
    assert upd["executionStatus"] == "STOPPED"
    # target A/B test created with per-variant eval + gateway filter on v1 path
    ab = _kw(dd.calls, "create_ab_test")
    per = ab["evaluationConfig"]["perVariantOnlineEvaluationConfig"]
    assert per[0]["onlineEvaluationConfigArn"] == "arn:oe-v1"
    assert per[1]["onlineEvaluationConfigArn"] == "arn:oe-v2"
    assert ab["gatewayFilter"]["targetPaths"] == ["/HRAgentV1/*"]
    assert result == {
        "targetIdV2": "tgt-v2-new",
        "onlineEvalArnV2": "arn:oe-v2",
        "onlineEvalIdV2": "oe-v2",
        "abTestId": "target-ab-1",
    }


def test_bundle_not_running_is_not_stopped() -> None:
    cc, dd = FakeControl(), FakeData(bundle_status="STOPPED")
    _target_ab_setup_run(_req(), cc, dd, lambda _m: None)
    assert not any(n == "update_ab_test" for n, _ in dd.calls)


def test_rerun_adopts_existing_v2_target_and_eval_on_conflict() -> None:
    cc = FakeControl(conflict={"create_gateway_target", "create_online_evaluation_config"})
    result = _target_ab_setup_run(_req(), cc, FakeData(), lambda _m: None)
    assert result["targetIdV2"] == "tgt-v2-existing"
    assert result["onlineEvalArnV2"] == "arn:oe-v2-existing"
    # The adopt path must surface the ID too (cleanup deletes by id).
    assert result["onlineEvalIdV2"] == "oe-v2-existing"


def test_missing_bundle_id_skips_stop() -> None:
    req = _req()
    req.bundleAbTestId = None
    dd = FakeData(bundle_status="RUNNING")
    _target_ab_setup_run(req, FakeControl(), dd, lambda _m: None)
    assert not any(n == "get_ab_test" for n, _ in dd.calls)
