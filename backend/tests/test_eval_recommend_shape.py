"""Phase 3 tests: evaluator + recommendation payload shape, fallback, polling."""

from __future__ import annotations

from typing import Any

from app import agentcore


def test_to_log_group_arn_normalizes_name() -> None:
    """StartRecommendation needs full log-group ARNs, not names (regression)."""
    name = "/aws/bedrock-agentcore/runtimes/HRAssistV1a47392-4zy2wpAwN8-DEFAULT"
    arn = agentcore.to_log_group_arn(name, "us-west-2", "434444145045")
    assert arn == (
        "arn:aws:logs:us-west-2:434444145045:log-group:"
        "/aws/bedrock-agentcore/runtimes/HRAssistV1a47392-4zy2wpAwN8-DEFAULT"
    )
    # Idempotent: an already-ARN value passes through unchanged.
    assert agentcore.to_log_group_arn(arn, "us-west-2", "434444145045") == arn


class Capture:
    def __init__(self, responses: dict[str, Any] | None = None) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.responses = responses or {}

    def start_batch_evaluation(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("start_batch_evaluation", kwargs))
        return {"batchEvaluationId": "be-1"}

    def start_recommendation(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("start_recommendation", kwargs))
        return {"recommendationId": "rec-1"}

    def get_recommendation(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("get_recommendation", kwargs))
        return self.responses.get("get_recommendation", {"status": "COMPLETED"})

    def get_batch_evaluation(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("get_batch_evaluation", kwargs))
        return self.responses.get("get_batch_evaluation", {"status": "COMPLETED"})


def test_batch_evaluation_kwargs() -> None:
    cap = Capture()
    agentcore.start_batch_evaluation(
        cap,
        name="HRBaseline",
        service_name="svc",
        log_groups=["aws/spans", "lg"],
        session_ids=["s1", "s2"],
    )
    _, kwargs = cap.calls[-1]
    ids = [e["evaluatorId"] for e in kwargs["evaluators"]]
    assert ids == [
        "Builtin.GoalSuccessRate",
        "Builtin.Helpfulness",
        "Builtin.Correctness",
    ]
    cw = kwargs["dataSourceConfig"]["cloudWatchLogs"]
    assert cw["serviceNames"] == ["svc"]
    assert cw["logGroupNames"] == ["aws/spans", "lg"]
    assert cw["filterConfig"]["sessionIds"] == ["s1", "s2"]


def test_batch_evaluation_custom_evaluator_list() -> None:
    """Caller-supplied evaluator ids (extra built-ins + custom) pass through."""
    cap = Capture()
    agentcore.start_batch_evaluation(
        cap,
        name="HRBaseline",
        service_name="svc",
        log_groups=["lg"],
        evaluators=["Builtin.GoalSuccessRate", "Builtin.Faithfulness", "custom-abc123"],
    )
    _, kwargs = cap.calls[-1]
    ids = [e["evaluatorId"] for e in kwargs["evaluators"]]
    assert ids == ["Builtin.GoalSuccessRate", "Builtin.Faithfulness", "custom-abc123"]


def test_all_builtin_evaluators_catalog() -> None:
    """13 built-ins; levels restricted to the documented three; defaults included."""
    cat = agentcore.ALL_BUILTIN_EVALUATORS
    assert len(cat) == 13
    assert set(cat.values()) <= {"SESSION", "TRACE", "TOOL_CALL"}
    assert cat["Builtin.GoalSuccessRate"] == "SESSION"
    assert cat["Builtin.ToolSelectionAccuracy"] == "TOOL_CALL"
    for eid in agentcore.BUILTIN_EVALUATORS:
        assert eid in cat


def test_create_llm_judge_evaluator_payload() -> None:
    class Cap(Capture):
        def create_evaluator(self, **kwargs: Any) -> dict[str, Any]:
            self.calls.append(("create_evaluator", kwargs))
            return {"evaluatorId": "ev-1", "evaluatorArn": "arn:ev-1", "status": "CREATING"}

    cap = Cap()
    scale = [
        {"value": 1.0, "label": "Good", "definition": "Fully compliant"},
        {"value": 0.0, "label": "Bad", "definition": "Non-compliant"},
    ]
    agentcore.create_llm_judge_evaluator(
        cap,
        name="HRPolicyCompliance",
        instructions="Judge {context} and {assistant_turn} for policy compliance.",
        rating_scale=scale,
        model_id="global.anthropic.claude-sonnet-4-5-20250929-v1:0",
        level="TRACE",
    )
    _, kwargs = cap.calls[-1]
    assert kwargs["evaluatorName"] == "HRPolicyCompliance"
    assert kwargs["level"] == "TRACE"
    judge = kwargs["evaluatorConfig"]["llmAsAJudge"]
    assert "{assistant_turn}" in judge["instructions"]
    assert judge["ratingScale"]["numerical"] == scale
    assert (
        judge["modelConfig"]["bedrockEvaluatorModelConfig"]["modelId"]
        == "global.anthropic.claude-sonnet-4-5-20250929-v1:0"
    )
    assert kwargs["clientToken"]


def test_list_evaluators_paginates() -> None:
    class Cap:
        def __init__(self) -> None:
            self.pages = [
                {"evaluators": [{"evaluatorId": "Builtin.Helpfulness"}], "nextToken": "t"},
                {"evaluators": [{"evaluatorId": "custom-1"}]},
            ]
            self.calls: list[dict[str, Any]] = []

        def list_evaluators(self, **kwargs: Any) -> dict[str, Any]:
            self.calls.append(kwargs)
            return self.pages[len(self.calls) - 1]

    cap = Cap()
    evs = agentcore.list_evaluators(cap)
    assert [e["evaluatorId"] for e in evs] == ["Builtin.Helpfulness", "custom-1"]
    assert cap.calls[1]["nextToken"] == "t"


def test_system_prompt_recommendation_type_and_config() -> None:
    cap = Capture()
    agentcore.start_system_prompt_recommendation(
        cap,
        name="HRSp",
        system_prompt="prompt",
        log_group_arns=["arn:lg"],
        service_names=["svc"],
    )
    _, kwargs = cap.calls[-1]
    assert kwargs["type"] == "SYSTEM_PROMPT_RECOMMENDATION"
    cfg = kwargs["recommendationConfig"]["systemPromptRecommendationConfig"]
    assert cfg["systemPrompt"]["text"] == "prompt"
    assert "evaluationConfig" in cfg
    assert "agentTraces" in cfg


def test_tool_description_recommendation_type_and_tools() -> None:
    cap = Capture()
    agentcore.start_tool_description_recommendation(
        cap,
        name="HRTd",
        tools=[{"toolName": "get_pto_balance", "description": "Return PTO."}],
        log_group_arns=["arn:lg"],
        service_names=["svc"],
    )
    _, kwargs = cap.calls[-1]
    assert kwargs["type"] == "TOOL_DESCRIPTION_RECOMMENDATION"
    tools = kwargs["recommendationConfig"]["toolDescriptionRecommendationConfig"][
        "toolDescription"
    ]["toolDescriptionText"]["tools"]
    assert tools[0]["toolName"] == "get_pto_balance"
    assert tools[0]["toolDescription"]["text"] == "Return PTO."


def test_parse_eval_scores() -> None:
    result = {
        "evaluationResults": {
            "evaluatorSummaries": [
                {"evaluatorId": "Builtin.GoalSuccessRate", "statistics": {"averageScore": 0.72}},
                {"evaluatorId": "Builtin.Helpfulness", "statistics": {"averageScore": 0.81}},
                {"evaluatorId": "NoScore", "statistics": {}},
            ]
        }
    }
    scores = agentcore.parse_eval_scores(result)
    assert {"evaluatorId": "Builtin.GoalSuccessRate", "score": 0.72} in scores
    assert len(scores) == 2  # the no-score evaluator is skipped


def test_poll_recommendation_surfaces_status(monkeypatch: Any) -> None:
    """Poller reports intermediate status via the progress callback and returns terminal."""
    seq = [{"status": "IN_PROGRESS"}, {"status": "COMPLETED", "recommendationResult": {}}]

    class SeqClient:
        def __init__(self) -> None:
            self.i = 0

        def get_recommendation(self, **_kw: Any) -> dict[str, Any]:
            r = seq[min(self.i, len(seq) - 1)]
            self.i += 1
            return r

    monkeypatch.setattr(agentcore.time, "sleep", lambda *_a, **_k: None)
    seen: list[str] = []
    result = agentcore.poll_recommendation(
        SeqClient(), recommendation_id="rec-1", progress=seen.append, interval=0
    )
    assert result["status"] == "COMPLETED"
    assert any("IN_PROGRESS" in s for s in seen)
    assert any("COMPLETED" in s for s in seen)


def test_system_prompt_recommendation_falls_back_on_error(monkeypatch: Any) -> None:
    """When the service returns an errorCode, the endpoint returns the input prompt."""
    import time as _t

    from fastapi.testclient import TestClient

    from app.main import app

    class ErrClient:
        def start_recommendation(self, **_kw: Any) -> dict[str, Any]:
            return {"recommendationId": "rec-err"}

        def get_recommendation(self, **_kw: Any) -> dict[str, Any]:
            return {
                "status": "COMPLETED",
                "recommendationResult": {
                    "systemPromptRecommendationResult": {
                        "errorCode": "INSUFFICIENT_DATA",
                        "errorMessage": "not enough traces",
                    }
                },
            }

    # Route the endpoint's data() client to our stub, and skip the STS-based
    # log-group ARN resolution (no real AWS in this unit test).
    from app.routers import recommend as rec_router

    monkeypatch.setattr(rec_router, "data", lambda _s: ErrClient())
    monkeypatch.setattr(rec_router, "get_session", lambda _c: None)
    monkeypatch.setattr(
        rec_router, "_resolve_log_group_arns", lambda _s, names: list(names)
    )

    client = TestClient(app)
    resp = client.post(
        "/api/recommend/system-prompt",
        json={
            "name": "HRSp",
            "systemPrompt": "ORIGINAL PROMPT",
            "logGroupArns": ["arn:lg"],
            "serviceNames": ["svc"],
        },
    )
    job_id = resp.json()["jobId"]
    j: dict[str, Any] = {"state": "pending"}
    for _ in range(50):
        j = client.get(f"/api/jobs/{job_id}").json()
        if j["state"] in ("completed", "failed"):
            break
        _t.sleep(0.05)
    assert j["state"] == "completed", j
    assert j["result"]["recommendedSystemPrompt"] == "ORIGINAL PROMPT"
    assert j["result"]["usedFallback"] is True
