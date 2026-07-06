#!/usr/bin/env bash
# One-shot start: FastAPI backend (:8787) + Vite dev server (:5173), both in
# the background with logs + pidfiles under .run/. Idempotent — already-running
# services are left alone. Stop everything with scripts/stop.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT/.run"
mkdir -p "$RUN_DIR"

BACKEND_PORT="${BACKEND_PORT:-8787}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

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

# ── Backend ──────────────────────────────────────────────────────────────────
if alive "$RUN_DIR/backend.pid"; then
  echo "• backend already running (pid $(cat "$RUN_DIR/backend.pid"))"
else
  echo "starting backend on :$BACKEND_PORT …"
  (
    cd "$ROOT/backend"
    nohup uv run uvicorn app.main:app --port "$BACKEND_PORT" \
      >"$RUN_DIR/backend.log" 2>&1 &
    echo $! >"$RUN_DIR/backend.pid"
  )
  wait_http "http://localhost:$BACKEND_PORT/api/health" "backend" 90
fi

# ── Frontend ─────────────────────────────────────────────────────────────────
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

echo
echo "App:  http://localhost:$FRONTEND_PORT"
echo "API:  http://localhost:$BACKEND_PORT/docs"
echo "Logs: $RUN_DIR/backend.log · $RUN_DIR/frontend.log"
echo "Stop: scripts/stop.sh"
