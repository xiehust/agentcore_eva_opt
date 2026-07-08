#!/usr/bin/env bash
# Run the demo agent WITH telemetry: ADOT auto-instrumentation exports the
# manual gen_ai spans to CloudWatch (aws/spans + the agent log group), which
# is exactly what AgentCore Evaluations reads. Requires AWS credentials
# (EC2 IAM role or env) with logs + xray permissions, and CloudWatch
# Transaction Search enabled in the account.
set -euo pipefail
cd "$(dirname "$0")"

SERVICE_NAME="agentxray-demo-agent"
LOG_GROUP="/aws/bedrock-agentcore/runtimes/agentxray-demo-agent"
REGION="${AWS_REGION:-us-west-2}"
PORT="${PORT:-9100}"

# The agent log group AND the runtime-logs stream must exist for the OTLP
# log exporter (both idempotent — errors on already-exists are ignored).
if command -v aws >/dev/null 2>&1; then
  aws logs create-log-group --log-group-name "$LOG_GROUP" --region "$REGION" 2>/dev/null \
    || true
  aws logs create-log-stream --log-group-name "$LOG_GROUP" \
    --log-stream-name runtime-logs --region "$REGION" 2>/dev/null || true
fi

# ─── Model backend: Bedrock via the instance role (no API key) ───────────────
export CLAUDE_CODE_USE_BEDROCK=1
export AWS_REGION="$REGION"
# Cross-region inference profile; override with ANTHROPIC_MODEL=... if needed.
export ANTHROPIC_MODEL="${ANTHROPIC_MODEL:-global.anthropic.claude-sonnet-4-6}"

# ─── OTEL / ADOT (mirrors the AgentCore observability-configure-3p doc) ──────
export AGENT_OBSERVABILITY_ENABLED=true
export OTEL_PYTHON_DISTRO=aws_distro
export OTEL_PYTHON_CONFIGURATOR=aws_configurator
export OTEL_RESOURCE_ATTRIBUTES="service.name=${SERVICE_NAME},aws.log.group.names=${LOG_GROUP}"
export OTEL_EXPORTER_OTLP_LOGS_HEADERS="x-aws-log-group=${LOG_GROUP},x-aws-log-stream=runtime-logs,x-aws-metric-namespace=bedrock-agentcore"
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
export OTEL_TRACES_EXPORTER=otlp

exec uv run opentelemetry-instrument uvicorn app.main:app --host 127.0.0.1 --port "$PORT"
