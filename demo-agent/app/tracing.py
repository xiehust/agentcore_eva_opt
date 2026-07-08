"""Manual Strands-shaped telemetry for a black-box agent.

AgentCore Evaluations joins two records per invocation:

  * an ``invoke_agent`` SPAN in ``aws/spans`` (metadata: who/when/session), and
  * a Gen AI content EVENT in the agent's log group (payload:
    ``body.input.messages`` / ``body.output.messages``).

Auto-instrumentation cannot see the Claude Agent SDK's LLM calls (they happen
in a CLI subprocess), so we emit both records ourselves.

Two hard requirements, learned the expensive way (each silently fails ALL
sessions otherwise):

1. **Scope must be a supported instrumentation library.** The service only
   parses spans/events whose ``scope.name`` is ``strands.telemetry.tracer``,
   ``opentelemetry.instrumentation.langchain``, or
   ``openinference.instrumentation.langchain`` (docs: "Understanding input
   spans"). We mirror Strands, so tracer AND event logger use its scope name.
2. **The event body must match the scope's shape exactly.** For Strands:
   ``input.messages`` = [{content: <system str>, role: system}, {content:
   {content: '[{"text": …}]'}, role: user}], ``output.messages`` =
   [{content: {message: <str>, finish_reason: end_turn}, role: assistant}].
   A generic {content: <plain str>} shape raises AgentSpanMappingException
   ("Failed to parse user_query from agent-span") per session.

session.id travels as span attribute, event attribute AND baggage. With no
OTEL SDK configured (unit tests, bare `run-local.sh`), tracer and event logger
are no-ops and everything here is safely inert.
"""

from __future__ import annotations

import json
import time
from collections.abc import Iterator
from contextlib import contextmanager

from opentelemetry import baggage, trace
from opentelemetry._events import Event, get_event_logger
from opentelemetry.context import attach, detach

AGENT_NAME = "agentxray-demo-agent"
PROVIDER = "anthropic"

# MUST be an evaluation-supported instrumentation scope (see module docstring).
EVAL_SCOPE = "strands.telemetry.tracer"

_tracer = trace.get_tracer(EVAL_SCOPE)
_event_logger = get_event_logger(EVAL_SCOPE)


@contextmanager
def traced_invocation(session_id: str, prompt: str) -> Iterator[trace.Span]:
    """invoke_agent span + session.id baggage around one invocation.

    The caller reports the answer with set_output(span, ...), which also emits
    the content event the evaluators parse.
    """
    token = attach(baggage.set_baggage("session.id", session_id))
    try:
        with _tracer.start_as_current_span(f"invoke_agent {AGENT_NAME}") as span:
            span.set_attribute("gen_ai.operation.name", "invoke_agent")
            span.set_attribute("gen_ai.system", PROVIDER)
            span.set_attribute("gen_ai.provider.name", PROVIDER)
            span.set_attribute("gen_ai.agent.name", AGENT_NAME)
            span.set_attribute("session.id", session_id)
            yield span
            span.set_status(trace.StatusCode.OK)
    finally:
        detach(token)


def record_result(
    span: trace.Span,
    *,
    session_id: str,
    system_prompt: str,
    prompt: str,
    output: str,
    model: str,
) -> None:
    """Attach result metadata to the span and emit the Strands-shaped content
    event carrying the actual messages (same traceId/spanId as the span)."""
    span.set_attribute("gen_ai.request.model", model)
    body = {
        "input": {
            "messages": [
                {"content": system_prompt, "role": "system"},
                {
                    "content": {"content": json.dumps([{"text": prompt}])},
                    "role": "user",
                },
            ]
        },
        "output": {
            "messages": [
                {
                    "content": {"message": output, "finish_reason": "end_turn"},
                    "role": "assistant",
                }
            ]
        },
    }
    ctx = span.get_span_context()
    _event_logger.emit(
        Event(
            name=EVAL_SCOPE,
            timestamp=time.time_ns(),
            body=body,
            attributes={"session.id": session_id},
            trace_id=ctx.trace_id,
            span_id=ctx.span_id,
            trace_flags=ctx.trace_flags,
        )
    )
