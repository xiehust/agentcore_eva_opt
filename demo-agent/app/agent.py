"""The actual agent: Claude Agent SDK query with a couple of demo tools.

The SDK spawns the Claude Code CLI as a subprocess, so OTEL auto-
instrumentation in THIS process cannot see the LLM calls — that's exactly why
the demo emits manual gen_ai spans (app.tracing) around each invocation, the
same shape any black-box agent would use.

Backend: Bedrock via CLAUDE_CODE_USE_BEDROCK=1 (set in run.sh) — the EC2 IAM
role supplies credentials; no API key needed.
"""

from __future__ import annotations

import ast
import json
import operator
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    TextBlock,
    ToolResultBlock,
    ToolUseBlock,
    UserMessage,
    create_sdk_mcp_server,
    query,
    tool,
)

SYSTEM_PROMPT = (
    "You are a concise demo assistant for the agentxray evaluation console. "
    "Answer briefly. Use the calculator tool for any arithmetic and the "
    "current_time tool for date/time questions."
)

# ─── Demo tools (make the traces interesting: tool-call spans exist) ─────────
_OPS: dict[type[ast.operator], Any] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.Mod: operator.mod,
}


def _safe_eval(node: ast.expr) -> float:
    """Arithmetic-only AST evaluation — no names, no calls."""
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_safe_eval(node.left), _safe_eval(node.right))
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        return -_safe_eval(node.operand)
    raise ValueError(f"unsupported expression: {ast.dump(node)}")


@tool("calculator", "Evaluate an arithmetic expression, e.g. '2 * (3 + 4)'", {"expression": str})
async def calculator(args: dict[str, Any]) -> dict[str, Any]:
    try:
        value = _safe_eval(ast.parse(args["expression"], mode="eval").body)
        text = f"{args['expression']} = {value}"
    except (ValueError, SyntaxError, ZeroDivisionError) as exc:
        text = f"error: {exc}"
    return {"content": [{"type": "text", "text": text}]}


@tool("current_time", "Current UTC date and time", {})
async def current_time(args: dict[str, Any]) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": datetime.now(UTC).isoformat()}]}


_SERVER = create_sdk_mcp_server(
    name="demo-tools", version="1.0.0", tools=[calculator, current_time]
)


# Tool metadata for telemetry (mirrors the @tool declarations above; the
# execute_tool spans carry description + schema like Strands does).
TOOL_SPECS: dict[str, dict[str, Any]] = {
    "calculator": {
        "description": "Evaluate an arithmetic expression, e.g. '2 * (3 + 4)'",
        "schema": {
            "properties": {"expression": {"type": "string"}},
            "required": ["expression"],
            "type": "object",
        },
    },
    "current_time": {
        "description": "Current UTC date and time",
        "schema": {"properties": {}, "type": "object"},
    },
}


@dataclass
class ToolCall:
    """One tool invocation, assembled from a ToolUseBlock + its result."""

    call_id: str
    name: str
    input: dict[str, Any]
    result_text: str = ""
    is_error: bool = False


@dataclass
class AgentResult:
    output: str
    tool_calls: list[ToolCall] = field(default_factory=list)


def _result_text(content: Any) -> str:
    """Flatten a ToolResultBlock's content (str or [{type: text, ...}])."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = [b.get("text", "") for b in content if isinstance(b, dict)]
        return "\n".join(p for p in parts if p)
    return json.dumps(content) if content is not None else ""


def build_options() -> ClaudeAgentOptions:
    return ClaudeAgentOptions(
        system_prompt=SYSTEM_PROMPT,
        mcp_servers={"tools": _SERVER},
        allowed_tools=["mcp__tools__calculator", "mcp__tools__current_time"],
        max_turns=5,
    )


async def run_agent(prompt: str, *, query_fn: Any = query) -> AgentResult:
    """One-shot agent run: collect the assistant's text AND its tool calls.

    Tool use arrives as ToolUseBlock (in AssistantMessage) and the matching
    ToolResultBlock (in UserMessage), paired by tool_use_id — both are
    captured so telemetry can emit execute_tool spans per call.

    ``query_fn`` is injectable so tests never spawn the CLI / call Bedrock.
    """
    chunks: list[str] = []
    calls: dict[str, ToolCall] = {}
    async for message in query_fn(prompt=prompt, options=build_options()):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    chunks.append(block.text)
                elif isinstance(block, ToolUseBlock):
                    # SDK-MCP tools are namespaced mcp__<server>__<name>.
                    name = block.name.split("__")[-1]
                    calls[block.id] = ToolCall(
                        call_id=block.id, name=name, input=dict(block.input or {})
                    )
        elif isinstance(message, UserMessage):
            content = message.content if isinstance(message.content, list) else []
            for block in content:
                if isinstance(block, ToolResultBlock) and block.tool_use_id in calls:
                    call = calls[block.tool_use_id]
                    call.result_text = _result_text(block.content)
                    call.is_error = bool(block.is_error)
    return AgentResult(output="\n".join(chunks).strip(), tool_calls=list(calls.values()))
