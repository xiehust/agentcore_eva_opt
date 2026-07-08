#!/usr/bin/env bash
# Offline dev variant: no OTEL export, no AWS. The tracer is a no-op, so the
# agent still answers (Bedrock creds required only when actually invoking).
set -euo pipefail
cd "$(dirname "$0")"

export CLAUDE_CODE_USE_BEDROCK=1
export AWS_REGION="${AWS_REGION:-us-west-2}"
export ANTHROPIC_MODEL="${ANTHROPIC_MODEL:-us.anthropic.claude-sonnet-4-5-20250929-v1:0}"

exec uv run uvicorn app.main:app --host 127.0.0.1 --port "${PORT:-9100}"
