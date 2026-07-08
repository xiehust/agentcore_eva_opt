"""Invoker abstraction: how dataset traffic reaches an agent during a run.

managed + deployed        → bedrock-agentcore InvokeAgentRuntime
external + invoke binding → generic HTTP POST (stdlib urllib, injectable opener)

Never log invoke header VALUES — they may carry user auth tokens.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from collections.abc import Callable
from typing import Any

from . import agentcore

DEFAULT_TIMEOUT_SECONDS = 60


def render_payload(template: str, *, prompt: str, session_id: str) -> str:
    """Replace the literal ``{prompt}`` / ``{sessionId}`` tokens with
    JSON-encoded values, so quotes/newlines/unicode in prompts stay valid JSON.

    Plain str.replace on the exact tokens — NOT str.format, which would choke
    on the template's other braces. The result must parse as JSON.
    """
    body = template.replace("{prompt}", json.dumps(prompt)).replace(
        "{sessionId}", json.dumps(session_id)
    )
    try:
        json.loads(body)
    except ValueError as exc:
        raise ValueError(f"payload template renders invalid JSON: {exc}") from exc
    return body


def invoke_http(
    invoke: dict[str, Any],
    *,
    session_id: str,
    prompt: str,
    opener: Any = None,
) -> str:
    """POST one prompt to an external agent's HTTP endpoint.

    The session id travels both in the rendered payload (default template) and
    in the configured session header. Raises RuntimeError on non-2xx with a
    body excerpt (no header values in the message).
    """
    template = invoke.get("payloadTemplate") or '{"prompt": {prompt}, "sessionId": {sessionId}}'
    body = render_payload(template, prompt=prompt, session_id=session_id)
    headers: dict[str, str] = {"Content-Type": "application/json"}
    headers.update(invoke.get("headers") or {})
    headers[invoke.get("sessionHeader") or "X-Session-Id"] = session_id
    request = urllib.request.Request(
        invoke["url"],
        data=body.encode("utf-8"),
        headers=headers,
        method=invoke.get("method") or "POST",
    )
    timeout = invoke.get("timeoutSeconds") or DEFAULT_TIMEOUT_SECONDS
    open_fn = opener or urllib.request.urlopen
    try:
        with open_fn(request, timeout=timeout) as resp:
            return resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        excerpt = exc.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(
            f"HTTP {exc.code} from agent endpoint: {excerpt}"
        ) from exc


def flatten_sse(body: str) -> str:
    """Collapse a text/event-stream body into plain text.

    Streaming runtimes answer with SSE — one JSON-encoded string per
    ``data:`` line. Non-SSE bodies pass through unchanged. Keeps the
    user-simulation actor's input (and the stored transcripts) readable.
    """
    if "data:" not in body:
        return body
    chunks: list[str] = []
    saw_data = False
    for line in body.splitlines():
        if not line.startswith("data:"):
            continue
        saw_data = True
        raw = line[len("data:"):].strip()
        if not raw:
            continue
        try:
            decoded = json.loads(raw)
            chunks.append(decoded if isinstance(decoded, str) else raw)
        except ValueError:
            chunks.append(raw)
    return "".join(chunks) if saw_data else body


def resolve_invoker(
    agent: dict[str, Any], data_client: Any
) -> Callable[[str, str], str] | None:
    """(session_id, prompt) -> response text, or None when the agent has no
    way to receive traffic (undeployed managed / external without invoke)."""
    deployment = agent.get("deployment") or {}
    if deployment.get("status") == "deployed":
        agent_arn = deployment["runtimeArn"]

        def _invoke_runtime(session_id: str, prompt: str) -> str:
            return flatten_sse(
                agentcore.invoke_agent_runtime(
                    data_client, agent_arn=agent_arn, session_id=session_id, prompt=prompt
                )
            )

        return _invoke_runtime
    invoke = (agent.get("binding") or {}).get("invoke")
    if invoke and invoke.get("url"):

        def _invoke_http(session_id: str, prompt: str) -> str:
            return invoke_http(invoke, session_id=session_id, prompt=prompt)

        return _invoke_http
    return None
