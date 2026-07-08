# agentxray demo external agent

A locally-runnable **external agent** used to demo (and e2e-test) the agentxray
console's external-agent evaluation: a FastAPI wrapper around the
[Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-python)
(Bedrock backend) that emits **manual OTEL gen_ai spans** and exports them to
CloudWatch via the ADOT SDK — no AgentCore runtime involved.

## Why manual spans?

The Claude Agent SDK spawns the Claude Code CLI as a subprocess, so OTEL
auto-instrumentation in this process can't see the LLM calls. `app/tracing.py`
emits both telemetry records AgentCore Evaluations joins per invocation —
an `invoke_agent agentxray-demo-agent` **span** (metadata → `aws/spans`) and a
Gen AI content **event** (`body.input.messages` / `body.output.messages` → the
agent log group), with `session.id` on both plus OTEL baggage. This is the
same shape ANY black-box agent can use to become evaluable.

Two hard-won requirements (both enforced in `app/tracing.py` and covered by
tests — each silently fails ALL sessions otherwise):

1. **Instrumentation scope must be a supported one.** Evaluations only parse
   spans/events whose `scope.name` is `strands.telemetry.tracer`,
   `opentelemetry.instrumentation.langchain`, or
   `openinference.instrumentation.langchain` (see *Understanding input spans*
   in the AgentCore docs). We mirror Strands, so the tracer AND event logger
   use the Strands scope name.
2. **The event body must match that scope's shape exactly.** For Strands the
   user message is `{content: {content: '[{"text": …}]'}, role: "user"}` and
   the answer is `{content: {message: …, finish_reason: "end_turn"}, role:
   "assistant"}`. A generic `{content: "<plain string>"}` body fails with
   `AgentSpanMappingException: Failed to parse user_query` per session
   (visible in the batch evaluation's results log stream under
   `/aws/bedrock-agentcore/evaluations/batch-evaluations/results/default`).

## Run

```bash
cd demo-agent
uv sync

./run.sh          # full telemetry: ADOT → CloudWatch (needs AWS creds; us-west-2)
./run-local.sh    # offline dev: no OTEL export (tracer is a no-op)
```

Both serve on `http://127.0.0.1:9100`:

```bash
curl -s localhost:9100/healthz
curl -s -X POST localhost:9100/invoke \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "What is 21 * 2?"}'
# → {"output": "...42...", "sessionId": "<generated uuid>"}
```

The model backend is Bedrock (`CLAUDE_CODE_USE_BEDROCK=1`,
`ANTHROPIC_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0` by default) —
credentials come from the usual AWS provider chain.

## Register in the console

| Console field   | Value |
| --------------- | ----- |
| OTEL service name | `agentxray-demo-agent` |
| CloudWatch log group | `/aws/bedrock-agentcore/runtimes/agentxray-demo-agent` |
| Invoke URL      | `http://127.0.0.1:9100/invoke` |
| Session header  | `X-Session-Id` (default) |
| Payload template | default (`{"prompt": {prompt}, "sessionId": {sessionId}}`) |

The session id arrives in the JSON body via the default payload template (the
header is belt-and-braces); the handler puts it into the spans, which is what
makes passive/active evaluation able to group this agent's sessions.

After registering: **Check telemetry** on the agent card verifies spans are
landing before you start an evaluation run.

## Tests

```bash
uv run ruff check .
uv run pytest -q     # all Bedrock/OTEL stubbed — no network, no cost
```
