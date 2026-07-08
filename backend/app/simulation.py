"""User simulation: an LLM-backed actor drives a multi-turn conversation.

Server-side equivalent of the AgentCore SDK's ``SimulationConfig`` actor loop
(devguide "User simulation"): the scenario's ``input`` opens the conversation;
after each agent reply the actor LLM (Bedrock Converse) produces
``{reasoning, message, stop}`` and the loop continues until the goal is met,
``max_turns`` is reached, or the actor yields no message.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

DEFAULT_ACTOR_MODEL_ID = "global.anthropic.claude-haiku-4-5-20251001-v1:0"

# Hard backstop regardless of what the scenario asks for.
MAX_TURNS_CAP = 20

_ACTOR_SYSTEM_TEMPLATE = """\
You are role-playing as a USER talking to a customer-facing AI agent.

Your persona:
- Context: {context}
- Goal: {goal}
{traits_block}
You opened the conversation with: {opening}

Stay in character. After each agent reply, decide your next move.

Respond ONLY with a JSON object, no code fences, in exactly this shape:
{{"reasoning": "<your private reasoning about the agent's last reply>",
 "message": "<the next thing you say to the agent, empty if you are done>",
 "stop": <true if your goal has been met, else false>}}
"""


def _actor_system_prompt(actor_profile: dict[str, Any], opening: str) -> str:
    traits = actor_profile.get("traits") or {}
    traits_block = (
        "- Traits: " + ", ".join(f"{k}={v}" for k, v in traits.items()) + "\n"
        if traits
        else ""
    )
    return _ACTOR_SYSTEM_TEMPLATE.format(
        context=actor_profile["context"],
        goal=actor_profile["goal"],
        traits_block=traits_block,
        opening=opening,
    )


def _parse_actor_reply(text: str) -> dict[str, Any] | None:
    """Parse the actor's JSON decision; tolerate code fences. None on failure."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
    try:
        parsed = json.loads(cleaned)
    except ValueError:
        return None
    if not isinstance(parsed, dict) or "message" not in parsed:
        return None
    return parsed


def run_simulated_scenario(
    invoke: Callable[[str, str], str],
    scenario: dict[str, Any],
    *,
    bedrock_client: Any,
    model_id: str = DEFAULT_ACTOR_MODEL_ID,
    session_id: str,
    progress: Callable[[str], None] = lambda _msg: None,
) -> dict[str, Any]:
    """Drive one simulated scenario; returns turn count, stop reason, transcript.

    Transcript entries: ``{turn, role: user|agent|actor_reasoning, text}``.
    The bedrock client is injected so tests can script the actor.
    """
    sid = scenario["scenario_id"]
    max_turns = min(int(scenario.get("max_turns", 10)), MAX_TURNS_CAP)
    system = [
        {"text": _actor_system_prompt(scenario["actor_profile"], scenario["input"])}
    ]

    transcript: list[dict[str, Any]] = []
    # Actor-perspective history: the agent speaks in the "user" role and the
    # actor replies as "assistant" (the actor LLM plays the human user).
    history: list[dict[str, Any]] = []
    stopped_by = "max_turns"
    message = scenario["input"]
    turns = 0

    for turn in range(1, max_turns + 1):
        turns = turn
        transcript.append({"turn": turn, "role": "user", "text": message})
        progress(f"{sid}: turn {turn}/{max_turns}")
        agent_reply = invoke(session_id, message)
        transcript.append({"turn": turn, "role": "agent", "text": agent_reply})
        if turn == max_turns:
            break

        history.append({"role": "user", "content": [{"text": agent_reply}]})
        resp = bedrock_client.converse(
            modelId=model_id, system=system, messages=history
        )
        actor_text = resp["output"]["message"]["content"][0]["text"]
        history.append({"role": "assistant", "content": [{"text": actor_text}]})

        decision = _parse_actor_reply(actor_text)
        if decision is None:
            transcript.append(
                {
                    "turn": turn,
                    "role": "actor_reasoning",
                    "text": "actor reply was not valid JSON — stopping simulation",
                }
            )
            stopped_by = "parse_error"
            break
        reasoning = decision.get("reasoning") or ""
        if reasoning:
            transcript.append(
                {"turn": turn, "role": "actor_reasoning", "text": reasoning}
            )
        if decision.get("stop"):
            stopped_by = "goal"
            break
        next_message = (decision.get("message") or "").strip()
        if not next_message:
            # Implicit goal completion, per the devguide's stop conditions.
            stopped_by = "no_message"
            break
        message = next_message

    return {
        "scenario_id": sid,
        "turns": turns,
        "stopped_by": stopped_by,
        "transcript": transcript,
    }
