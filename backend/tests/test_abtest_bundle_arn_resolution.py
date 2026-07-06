"""Regression tests: /abtest/config-bundle must resolve bundle IDs to ARNs.

The frontend only persists bundle IDs (Step 6 stores controlBundleId, not an
ARN); CreateABTest requires full configuration-bundle ARNs, so the router must
look them up via get_configuration_bundle when given a bare ID.
"""

from __future__ import annotations

from typing import Any

from app.routers.abtest import _resolve_bundle_arn

_ARN = (
    "arn:aws:bedrock-agentcore:us-west-2:434444145045:"
    "configuration-bundle/HRControl4a9fd7-iNwHbbCT50"
)


class FakeControl:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def get_configuration_bundle(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(kwargs)
        return {"bundleArn": _ARN, "bundleId": kwargs["bundleId"]}


def test_full_arn_passes_through_without_lookup() -> None:
    cc = FakeControl()
    assert _resolve_bundle_arn(cc, _ARN) == _ARN
    assert cc.calls == []


def test_bare_bundle_id_is_resolved_to_arn() -> None:
    cc = FakeControl()
    assert _resolve_bundle_arn(cc, "HRControl4a9fd7-iNwHbbCT50") == _ARN
    assert cc.calls == [{"bundleId": "HRControl4a9fd7-iNwHbbCT50"}]


def test_empty_value_raises_a_readable_error() -> None:
    cc = FakeControl()
    try:
        _resolve_bundle_arn(cc, "")
    except ValueError as exc:
        assert "bundle" in str(exc).lower()
    else:  # pragma: no cover
        raise AssertionError("expected ValueError for empty bundle ref")


class ConflictException(Exception):
    """Mimics botocore's ConflictException (matched by class name)."""


class FakeData:
    """Data-plane client whose create_ab_test always conflicts."""

    def create_ab_test(self, **kwargs: Any) -> dict[str, Any]:
        raise ConflictException("AB test with name 'HRBundleAB4a9fd7' already exists")

    def list_ab_tests(self, **kwargs: Any) -> dict[str, Any]:
        # AWS lowercases stored A/B test names.
        return {"abTests": [{"abTestId": "ab-existing", "name": "hrbundleab4a9fd7"}]}


def test_create_ab_test_conflict_adopts_existing_by_name() -> None:
    from app.routers.abtest import _create_ab_test_idempotent

    resp = _create_ab_test_idempotent(
        FakeData(), name="HRBundleAB4a9fd7", gatewayArn="arn:gw", variants=[]
    )
    assert resp["abTestId"] == "ab-existing"
