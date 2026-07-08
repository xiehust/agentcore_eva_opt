"""Span + Gen AI event emission asserted via in-memory SDK exporters."""

from __future__ import annotations

from typing import Any

import pytest
from claude_agent_sdk import AssistantMessage, TextBlock
from fastapi.testclient import TestClient
from opentelemetry import _events as otel_events
from opentelemetry import trace
from opentelemetry.sdk._events import EventLoggerProvider
from opentelemetry.sdk._logs import LoggerProvider
from opentelemetry.sdk._logs.export import InMemoryLogExporter, SimpleLogRecordProcessor
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from app.main import app

# set_*_provider is once-per-process; app.tracing grabbed its tracer/event
# logger at import time — re-bind them to the SDK providers installed here.
_SPAN_EXPORTER = InMemorySpanExporter()
_TRACER_PROVIDER = TracerProvider()
_TRACER_PROVIDER.add_span_processor(SimpleSpanProcessor(_SPAN_EXPORTER))
trace.set_tracer_provider(_TRACER_PROVIDER)

_LOG_EXPORTER = InMemoryLogExporter()
_LOGGER_PROVIDER = LoggerProvider()
_LOGGER_PROVIDER.add_log_record_processor(SimpleLogRecordProcessor(_LOG_EXPORTER))
_EVENT_PROVIDER = EventLoggerProvider(logger_provider=_LOGGER_PROVIDER)
otel_events.set_event_logger_provider(_EVENT_PROVIDER)

from app import tracing  # noqa: E402

tracing._tracer = trace.get_tracer(tracing.EVAL_SCOPE)
tracing._event_logger = _EVENT_PROVIDER.get_event_logger(tracing.EVAL_SCOPE)


@pytest.fixture(autouse=True)
def clear_telemetry():
    _SPAN_EXPORTER.clear()
    _LOG_EXPORTER.clear()
    yield
    _SPAN_EXPORTER.clear()
    _LOG_EXPORTER.clear()


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    from app import agent as agent_module

    real_run_agent = agent_module.run_agent

    async def fake_query(prompt: str, options: Any):
        yield AssistantMessage(content=[TextBlock(text="out-text")], model="stub")

    async def run_stub(prompt: str, *, query_fn: Any = None) -> str:
        return await real_run_agent(prompt, query_fn=fake_query)

    monkeypatch.setattr("app.main.agent.run_agent", run_stub)
    monkeypatch.setenv("ANTHROPIC_MODEL", "test-model-id")
    return TestClient(app)


def test_invoke_emits_strands_shaped_span_and_event(client: TestClient) -> None:
    resp = client.post("/invoke", json={"prompt": "the prompt", "sessionId": "sess-77"})
    assert resp.status_code == 200

    # ── The invoke_agent span (metadata) ────────────────────────────────────
    spans = _SPAN_EXPORTER.get_finished_spans()
    assert len(spans) == 1
    span = spans[0]
    # Evaluations only parse spans with a supported instrumentation scope.
    assert span.instrumentation_scope.name == "strands.telemetry.tracer"
    assert span.name == "invoke_agent agentxray-demo-agent"
    assert span.attributes["gen_ai.operation.name"] == "invoke_agent"
    assert span.attributes["gen_ai.agent.name"] == "agentxray-demo-agent"
    assert span.attributes["gen_ai.provider.name"] == "anthropic"
    assert span.attributes["gen_ai.request.model"] == "test-model-id"
    assert span.attributes["session.id"] == "sess-77"
    assert span.status.status_code.name == "OK"

    # ── The Gen AI content event (payload the evaluators parse) ─────────────
    logs = _LOG_EXPORTER.get_finished_logs()
    assert len(logs) == 1
    record = logs[0].log_record
    assert logs[0].instrumentation_scope.name == "strands.telemetry.tracer"
    assert record.attributes["session.id"] == "sess-77"
    # Correlated to the span.
    assert record.trace_id == span.context.trace_id
    assert record.span_id == span.context.span_id
    # Exact Strands body shape (anything else → AgentSpanMappingException).
    body = record.body
    in_msgs = body["input"]["messages"]
    assert in_msgs[0]["role"] == "system"
    assert isinstance(in_msgs[0]["content"], str)
    assert in_msgs[1]["role"] == "user"
    assert in_msgs[1]["content"] == {"content": '[{"text": "the prompt"}]'}
    out_msgs = body["output"]["messages"]
    assert out_msgs == [
        {"content": {"message": "out-text", "finish_reason": "end_turn"}, "role": "assistant"}
    ]


def test_error_path_still_closes_span(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    async def exploding(prompt: str, *, query_fn: Any = None) -> str:
        raise RuntimeError("boom")

    monkeypatch.setattr("app.main.agent.run_agent", exploding)
    resp = client.post("/invoke", json={"prompt": "p", "sessionId": "s"})
    assert resp.status_code == 502

    spans = _SPAN_EXPORTER.get_finished_spans()
    assert len(spans) == 1
    assert spans[0].attributes["gen_ai.operation.name"] == "invoke_agent"
    assert any(e.name == "exception" for e in spans[0].events)
    # No content event on failure — nothing to evaluate.
    assert _LOG_EXPORTER.get_finished_logs() == ()
