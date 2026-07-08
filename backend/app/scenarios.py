"""Scenario helpers for dataset evaluation (devguide "Dataset schema").

``normalize_scenarios`` turns any dataset row into a uniform scenario list;
``ground_truth_metadata`` builds the ``StartBatchEvaluation``
``evaluationMetadata.sessionMetadata`` payload from scenario ground truth
(assertions → Builtin.GoalSuccessRate, expected_trajectory →
Builtin.Trajectory*Match, turns[].expected_response → Builtin.Correctness).
"""

from __future__ import annotations

from typing import Any

from .models import format_prompt


def normalize_scenarios(dataset: dict[str, Any]) -> list[dict[str, Any]]:
    """Return the dataset's scenarios in devguide schema.

    Legacy prompt items become single-turn predefined scenarios (context
    prefix applied); predefined/simulated items pass through as stored.
    """
    items: list[dict[str, Any]] = dataset["items"]
    if dataset.get("kind", "legacy") != "legacy":
        return items
    return [
        {
            "scenario_id": f"item_{i + 1}",
            "turns": [
                {
                    "input": format_prompt(
                        item["prompt"],
                        context=item.get("context"),
                        employee_id=item.get("employeeId"),
                    )
                }
            ],
        }
        for i, item in enumerate(items)
    ]


def ground_truth_metadata(
    scenarios: list[dict[str, Any]], session_ids: list[str]
) -> list[dict[str, Any]]:
    """Build ``sessionMetadata`` entries for scenarios that carry ground truth.

    Shape (verified against the boto3 service model):
    ``{sessionId, testScenarioId, groundTruth: {inline: {assertions:
    [{text}], expectedTrajectory: {toolNames}, turns: [{input: {prompt},
    expectedResponse: {text}}]}}}`` — only non-empty keys are included, and
    scenarios with no ground truth at all are omitted entirely.
    """
    out: list[dict[str, Any]] = []
    for scenario, session_id in zip(scenarios, session_ids, strict=True):
        inline: dict[str, Any] = {}
        if scenario.get("assertions"):
            inline["assertions"] = [{"text": a} for a in scenario["assertions"]]
        if scenario.get("expected_trajectory"):
            inline["expectedTrajectory"] = {"toolNames": scenario["expected_trajectory"]}
        turns = [
            {
                "input": {"prompt": t["input"]},
                "expectedResponse": {"text": t["expected_response"]},
            }
            for t in scenario.get("turns", [])
            if t.get("expected_response")
        ]
        if turns:
            inline["turns"] = turns
        if not inline:
            continue
        out.append(
            {
                "sessionId": session_id,
                "testScenarioId": scenario["scenario_id"],
                "groundTruth": {"inline": inline},
            }
        )
    return out
