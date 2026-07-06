#!/usr/bin/env bash
# Stop the services started by scripts/start.sh. Kills the recorded pid and
# its children (uvicorn/vite spawn workers), then falls back to whoever is
# listening on the ports so a stale pidfile never leaves an orphan behind.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT/.run"

BACKEND_PORT="${BACKEND_PORT:-8787}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

stop_one() { # stop_one <name> <pidfile> <port>
  local name="$1" pf="$2" port="$3" pid=""
  if [[ -f "$pf" ]]; then
    pid="$(cat "$pf")"
    if kill -0 "$pid" 2>/dev/null; then
      # TERM the whole subtree (children first, then the recorded pid).
      pkill -TERM -P "$pid" 2>/dev/null || true
      kill -TERM "$pid" 2>/dev/null || true
      for _ in $(seq 1 20); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.25
      done
      kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null || true
      echo "✓ $name stopped (pid $pid)"
    else
      echo "• $name pidfile was stale"
    fi
    rm -f "$pf"
  else
    echo "• $name not started by start.sh (no pidfile)"
  fi
  # Fallback: free the port if anything else still holds it.
  if fuser -s "$port/tcp" 2>/dev/null; then
    fuser -k -TERM "$port/tcp" 2>/dev/null || true
    sleep 1
    fuser -s "$port/tcp" 2>/dev/null && fuser -k -KILL "$port/tcp" 2>/dev/null || true
    echo "✓ freed port :$port"
  fi
}

stop_one "frontend" "$RUN_DIR/frontend.pid" "$FRONTEND_PORT"
stop_one "backend" "$RUN_DIR/backend.pid" "$BACKEND_PORT"
echo "done"
