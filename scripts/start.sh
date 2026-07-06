#!/usr/bin/env bash
# One-shot start, in the background with logs + pidfiles under .run/.
#
#   scripts/start.sh          dev:  backend :8787 (localhost) + Vite :5173
#   scripts/start.sh --prod   prod: backend only, 0.0.0.0:8787, serving the
#                             built SPA from dist/ and requiring the password
#                             from .run/auth_password (generated on first run)
#                             — the single ALB/CloudFront target.
#
# Idempotent — already-running services are left alone. Stop: scripts/stop.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT/.run"
mkdir -p "$RUN_DIR"

BACKEND_PORT="${BACKEND_PORT:-8787}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
MODE="dev"
[[ "${1:-}" == "--prod" ]] && MODE="prod"

alive() { # alive <pidfile>
  local pf="$1"
  [[ -f "$pf" ]] && kill -0 "$(cat "$pf")" 2>/dev/null
}

wait_http() { # wait_http <url> <name> <timeout_s>
  local url="$1" name="$2" timeout="${3:-60}" i=0
  until curl -sf -o /dev/null "$url"; do
    i=$((i + 1))
    if ((i >= timeout * 2)); then
      echo "✗ $name did not answer at $url within ${timeout}s — check the log" >&2
      return 1
    fi
    sleep 0.5
  done
  echo "✓ $name ready — $url"
}

# ── Prod prerequisites: built SPA + access password ──────────────────────────
AUTH_ARGS=()
HOST_ARGS=()
if [[ "$MODE" == "prod" ]]; then
  if [[ ! -f "$ROOT/dist/index.html" ]]; then
    echo "building frontend (dist/ missing) …"
    (cd "$ROOT" && npm run build >"$RUN_DIR/build.log" 2>&1)
  fi
  PASS_FILE="$RUN_DIR/auth_password"
  if [[ -n "${LAB4_AUTH_PASSWORD:-}" ]]; then
    printf '%s' "$LAB4_AUTH_PASSWORD" >"$PASS_FILE"
    chmod 600 "$PASS_FILE"
  elif [[ ! -s "$PASS_FILE" ]]; then
    openssl rand -base64 18 | tr -d '/+=' | head -c 20 >"$PASS_FILE"
    chmod 600 "$PASS_FILE"
    echo "generated access password → $PASS_FILE"
  fi
  # First line only — the file may carry human notes below the password.
  export LAB4_AUTH_PASSWORD="$(head -n 1 "$PASS_FILE")"
  HOST_ARGS=(--host 0.0.0.0)
fi

# ── Backend ──────────────────────────────────────────────────────────────────
if alive "$RUN_DIR/backend.pid"; then
  echo "• backend already running (pid $(cat "$RUN_DIR/backend.pid"))"
else
  echo "starting backend ($MODE) on :$BACKEND_PORT …"
  (
    cd "$ROOT/backend"
    nohup uv run uvicorn app.main:app --port "$BACKEND_PORT" "${HOST_ARGS[@]}" \
      >"$RUN_DIR/backend.log" 2>&1 &
    echo $! >"$RUN_DIR/backend.pid"
  )
  wait_http "http://localhost:$BACKEND_PORT/api/health" "backend" 90
fi

# ── Frontend (dev only — prod serves dist/ from the backend) ─────────────────
if [[ "$MODE" == "dev" ]]; then
  if alive "$RUN_DIR/frontend.pid"; then
    echo "• frontend already running (pid $(cat "$RUN_DIR/frontend.pid"))"
  else
    echo "starting frontend on :$FRONTEND_PORT …"
    (
      cd "$ROOT"
      # --strictPort: fail fast instead of silently drifting to another port.
      nohup npx vite --port "$FRONTEND_PORT" --strictPort \
        >"$RUN_DIR/frontend.log" 2>&1 &
      echo $! >"$RUN_DIR/frontend.pid"
    )
    wait_http "http://localhost:$FRONTEND_PORT" "frontend" 60
  fi
fi

echo
if [[ "$MODE" == "prod" ]]; then
  echo "App+API:  http://<this-host>:$BACKEND_PORT  (single port — SPA + /api)"
  echo "Password: $RUN_DIR/auth_password"
else
  echo "App:  http://localhost:$FRONTEND_PORT"
  echo "API:  http://localhost:$BACKEND_PORT/docs"
fi
echo "Logs: $RUN_DIR/backend.log · $RUN_DIR/frontend.log"
echo "Stop: scripts/stop.sh"
