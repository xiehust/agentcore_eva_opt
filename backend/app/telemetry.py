"""Telemetry binding resolution + CloudWatch span probing.

Evaluation only needs to know WHERE an agent's OTEL traces land — the
(service_name, log_group) pair — regardless of whether the agent runs on the
AgentCore runtime or anywhere else. The probe helpers verify that spans for a
service actually exist in ``aws/spans`` (with ``session.id``) BEFORE any
evaluation is spent on empty data — the #1 external-agent failure mode.

All helpers take an explicit ``logs_client`` so tests pass stubs.
"""

from __future__ import annotations

import json
import time
from typing import Any

SPANS_LOG_GROUP = "aws/spans"


def resolve_telemetry(agent: dict[str, Any]) -> tuple[str, str]:
    """Return (service_name, log_group) for an agent row.

    An active AgentCore deployment wins; otherwise fall back to the external
    telemetry binding. Raises ValueError when neither exists — routers catch
    and convert to a 400.
    """
    deployment = agent.get("deployment") or {}
    if deployment.get("status") == "deployed":
        return deployment["serviceName"], deployment["logGroup"]
    binding = agent.get("binding") or {}
    if binding.get("serviceName") and binding.get("logGroup"):
        return binding["serviceName"], binding["logGroup"]
    raise ValueError("agent has neither an active deployment nor a telemetry binding")


def check_log_group_exists(logs_client: Any, name: str) -> bool:
    """True when the exact log group name exists."""
    resp = logs_client.describe_log_groups(logGroupNamePrefix=name, limit=50)
    return any(g.get("logGroupName") == name for g in resp.get("logGroups", []))


def find_recent_spans(
    logs_client: Any,
    *,
    service_name: str,
    lookback_hours: int = 24,
    log_group: str = SPANS_LOG_GROUP,
    limit: int = 50,
    max_pages: int = 20,
) -> list[dict[str, Any]]:
    """Recent span events for a service from the Transaction Search log group.

    Uses a quoted term filter on the service name, then keeps only events whose
    message actually contains it (the filter is a term match, not exact).

    filter_log_events scans the window in portions: a page with zero events
    but a nextToken means "keep scanning", NOT "no matches" — aws/spans holds
    the whole account's spans, so wide windows need several pages. Bounded by
    ``max_pages`` to keep the probe fast.
    """
    start_ms = int((time.time() - lookback_hours * 3600) * 1000)
    spans: list[dict[str, Any]] = []
    token: str | None = None
    for _ in range(max_pages):
        kwargs: dict[str, Any] = {
            "logGroupName": log_group,
            "filterPattern": f'"{service_name}"',
            "startTime": start_ms,
            "limit": limit,
        }
        if token:
            kwargs["nextToken"] = token
        resp = logs_client.filter_log_events(**kwargs)
        for event in resp.get("events", []):
            message = event.get("message", "")
            if service_name not in message:
                continue
            try:
                spans.append(json.loads(message))
            except (ValueError, TypeError):
                continue
        token = resp.get("nextToken")
        if not token or len(spans) >= limit:
            break
    return spans[:limit]


def _iter_attribute_dicts(span: dict[str, Any]) -> list[dict[str, Any]]:
    """All attribute dicts in a span event, tolerant of shape variations:
    nested ``attributes``, ``resource.attributes``, or flat top-level keys."""
    dicts: list[dict[str, Any]] = []
    for key in ("attributes", "spanAttributes"):
        value = span.get(key)
        if isinstance(value, dict):
            dicts.append(value)
    resource = span.get("resource")
    if isinstance(resource, dict):
        attrs = resource.get("attributes")
        if isinstance(attrs, dict):
            dicts.append(attrs)
    dicts.append(span)  # flat keys, e.g. {"session.id": ...}
    return dicts


def _find_attr(span: dict[str, Any], key: str) -> Any:
    for attrs in _iter_attribute_dicts(span):
        if key in attrs:
            return attrs[key]
    return None


def inspect_spans(spans: list[dict[str, Any]]) -> dict[str, Any]:
    """Summarize probed spans: count, freshness, session.id + gen_ai coverage."""
    session_ids: list[str] = []
    operation_names: set[str] = set()
    last_ts: float | None = None
    for span in spans:
        sid = _find_attr(span, "session.id")
        if sid and str(sid) not in session_ids:
            session_ids.append(str(sid))
        op = _find_attr(span, "gen_ai.operation.name")
        if op:
            operation_names.add(str(op))
        for ts_key in ("endTimeUnixNano", "endTime", "@timestamp"):
            ts = span.get(ts_key)
            if isinstance(ts, (int, float)) and (last_ts is None or ts > last_ts):
                last_ts = float(ts)
    return {
        "spanCount": len(spans),
        "lastSpanAt": last_ts,
        "sessionIdPresent": len(session_ids) > 0,
        "sessionIdSamples": session_ids[:3],
        "operationNames": sorted(operation_names),
    }


def telemetry_report(
    logs_client: Any,
    *,
    service_name: str,
    log_group: str,
    lookback_hours: int = 24,
) -> dict[str, Any]:
    """One-shot health report: does this agent's telemetry reach CloudWatch?

    ``ok`` requires spans in aws/spans AND session.id present — the two things
    evaluations cannot work without. Hints are English technical strings
    (rendered verbatim in the UI, like terminal statuses).
    """
    log_group_exists = check_log_group_exists(logs_client, log_group)
    spans = find_recent_spans(
        logs_client, service_name=service_name, lookback_hours=lookback_hours
    )
    inspected = inspect_spans(spans)

    hints: list[str] = []
    if not log_group_exists:
        hints.append(
            f"Log group {log_group} does not exist — fine if only aws/spans is used, "
            "otherwise check OTEL_EXPORTER_OTLP_LOGS_HEADERS x-aws-log-group."
        )
    if inspected["spanCount"] == 0:
        hints.append(
            f"No spans found for service.name={service_name} in {SPANS_LOG_GROUP} "
            f"over the last {lookback_hours}h. Check OTEL_RESOURCE_ATTRIBUTES "
            "(service.name), OTEL_TRACES_EXPORTER=otlp, and that CloudWatch "
            "Transaction Search is enabled."
        )
    elif not inspected["sessionIdPresent"]:
        hints.append(
            "Spans found but none carry session.id — evaluations cannot group "
            "sessions. Set it via OTEL baggage: "
            'baggage.set_baggage("session.id", session_id) and attach the context.'
        )

    return {
        "ok": inspected["spanCount"] > 0 and inspected["sessionIdPresent"],
        "serviceName": service_name,
        "logGroup": {"name": log_group, "exists": log_group_exists},
        "spans": inspected,
        "hints": hints,
    }
