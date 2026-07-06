"""Gateway traffic (step 7e): SigV4-signed POSTs through the gateway URL.

A/B routing only happens for traffic that enters via the gateway — direct
invoke_agent_runtime calls bypass it entirely, so the A/B test would never
collect sessions. This exercises URL construction and per-session behavior
with a fake HTTP poster (no real AWS).
"""

from __future__ import annotations

from typing import Any

from app.models import GatewayTrafficRequest, TrafficPrompt
from app.routers.abtest import _gateway_traffic_run


class FakeControl:
    def get_gateway(self, **kwargs: Any) -> dict[str, Any]:
        return {
            "gatewayUrl": "https://gw-1.gateway.bedrock-agentcore.us-west-2.amazonaws.com",
            "status": "READY",
        }


class FakePoster:
    """Records every signed POST; returns HTTP 200."""

    def __init__(self) -> None:
        self.posts: list[dict[str, Any]] = []

    def __call__(self, url: str, *, content: str, headers: dict[str, str]) -> Any:
        self.posts.append({"url": url, "content": content, "headers": headers})

        class R:
            status_code = 200
            text = "ok"

        return R()


def _req() -> GatewayTrafficRequest:
    return GatewayTrafficRequest(
        gatewayId="gw-1",
        targetName="HRAgentV1",
        prompts=[TrafficPrompt(prompt="p1"), TrafficPrompt(prompt="p2")],
    )


def _signer(_creds: Any, _region: str, aws_req: Any) -> None:
    aws_req.headers["Authorization"] = "SIGV4-TEST"


def test_traffic_posts_to_gateway_target_invocations_url() -> None:
    poster = FakePoster()
    result = _gateway_traffic_run(
        _req(), FakeControl(), None, "us-west-2", poster, _signer, lambda _m: None
    )
    assert result["count"] == 2
    assert all(
        p["url"]
        == "https://gw-1.gateway.bedrock-agentcore.us-west-2.amazonaws.com/HRAgentV1/invocations"
        for p in poster.posts
    )


def test_each_session_gets_unique_id_in_body_and_header() -> None:
    poster = FakePoster()
    import json

    result = _gateway_traffic_run(
        _req(), FakeControl(), None, "us-west-2", poster, _signer, lambda _m: None
    )
    sids = []
    for p in poster.posts:
        body = json.loads(p["content"])
        sid = body["sessionId"]
        sids.append(sid)
        assert p["headers"]["X-Amzn-Bedrock-AgentCore-Runtime-Session-Id"] == sid
        assert p["headers"]["Authorization"] == "SIGV4-TEST"
    assert len(set(sids)) == 2
    assert result["sessionIds"] == sids


def test_failed_posts_are_counted_not_fatal() -> None:
    class FlakyPoster(FakePoster):
        def __call__(self, url: str, *, content: str, headers: dict[str, str]) -> Any:
            super().__call__(url, content=content, headers=headers)

            class R:
                status_code = 500 if len(self.posts) == 1 else 200
                text = "boom"

            return R()

    result = _gateway_traffic_run(
        _req(), FakeControl(), None, "us-west-2", FlakyPoster(), _signer, lambda _m: None
    )
    assert result["count"] == 1
    assert result["failed"] == 1
