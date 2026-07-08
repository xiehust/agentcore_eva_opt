# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An interactive rebuild of the AWS Bedrock AgentCore "Lab 4 — Agent Optimization" notebook, with two modes switched from the header toggle:

- **Simulation** (default) — a guided 10-step wizard. Fully self-contained: no AWS calls, fabricated identifiers (account `123456789012`), deterministic timers/results.
- **Live AWS** — a general-purpose agent-evaluation console making **real** `bedrock-agentcore` calls through a local FastAPI backend. Creates real resources and incurs cost (default region `us-west-2`).

The source of truth is `sample-open-weight-models-with-amazon-bedrock/lab4/Lab4_AgentCore_Optimization.ipynb`. That directory is a vendored AWS sample: **leave it untouched** — the backend imports its `deploy_agent.py` / `hr_assistant_agent.py` at runtime (located via `backend/app/lab4_path.py`) and serves them as read-only samples.

## Commands

### Frontend (repo root)

```bash
npm run dev        # Vite dev server :5173 (proxies /api → :8787)
npm run build      # tsc --noEmit + vite build → dist/
npm run typecheck  # tsc --noEmit
npm run lint       # eslint .
npm run test       # vitest run (whole suite, jsdom)
npx vitest run src/lib/liveApi.test.ts   # single test file
npx vitest run -t "name substring"       # single test by name
```

### Backend (from `backend/`, uses uv)

```bash
uv run uvicorn app.main:app --port 8787  # run the API
uv run ruff check .                      # lint
uv run pytest -q                         # tests (no mutating AWS calls; DB is :memory:)
uv run pytest tests/test_runs_flow.py -q # single test file
```

### Both at once

```bash
./scripts/start.sh   # backend :8787 + frontend :5173, detached; logs/pids in .run/
./scripts/stop.sh    # stop both
./scripts/start.sh --prod  # backend only on 0.0.0.0:8787, serves built SPA from dist/,
                           # requires LAB4_AUTH_PASSWORD (or generated .run/auth_password)
```

`backend/scripts/e2e_live.py` is a real end-to-end smoke test against AWS (**incurs cost**; always cleans up in `finally`). Don't run it casually.

## Architecture

### Frontend (`src/`, React 18 + TS + Vite 6 + Tailwind v4)

- `state/journey.ts` — the central reducer/context: `STEP_ORDER` (10 step keys), mode (`sim` | `live`), per-step status/artifacts, optional live credentials (never persisted). `App.tsx` renders `ConsoleShell` when mode is `live`, otherwise the wizard (`StepShell`) or `Landing`.
- `steps/` — the 10 Sim wizard step components, registered in `steps/manifest.ts`. Each step reveals the `boto3` call it stands in for (`data/codeSnippets.ts`).
- `sim/engine.ts` — deterministic fabrication of ARNs/IDs/results (seeded PRNG; the fake account id is hard-pinned).
- `console/` — the Live console: `ConsoleShell` + seven pages (`Agents`, `Datasets`, `Evaluators`, `Runs`, `Insights`, `Experiments`, `Cleanup`), section state in `state/console.ts`.
- `lib/liveApi.ts` — typed client for the backend; long operations return `{jobId}` which is polled via `pollJob` / `GET /api/jobs/{id}`. Resource types here mirror `backend/app/db.py` row shapes.
- `lib/persistence.ts` — credential-free journey snapshot saved to `PUT /api/session`, restored on load (survives reload/backend restart).
- `i18n/` — bilingual catalog, **zh is the default**. Both locales implement the same `Messages` interface, so a missing key in either language is a compile error. Narrative text is translated; technical content (API names, ARNs, code snippets, terminal statuses) intentionally stays English. Any new UI string must be added to both catalogs in `i18n/messages.ts`.
- Heavy deps are lazy-loaded: Recharts (`LazyABChart`) and CodeMirror (`LazyCodeEditor`).

### Backend (`backend/app/`, FastAPI + boto3)

- `main.py` — wires routers, CORS for :5173/:4173, the optional auth middleware, and (in prod) serves the built SPA from `../dist` so one port sits behind the ALB.
- `routers/` — one file per resource: legacy wizard endpoints (`deploy`, `evaluate`, `bundles`, `recommend`, `abtest`, `cleanup`, `session`) plus console resources (`agents`, `datasets`, `runs`, `samples`, `experiments`, `insights`, `evaluators`).
- `jobs.py` — background-job pattern: long AWS operations (deploy, traffic, batch eval, recommend, A/B monitor) run on a worker thread; handlers return `{jobId}` immediately; status/results are mirrored to SQLite so completed jobs survive restarts.
- `db.py` — stdlib `sqlite3`, WAL mode, module lock; `backend/data/lab4.db` by default, `LAB4_DB_PATH` override (`:memory:` in tests). Tables: jobs, session_state, agents, datasets, runs, insight_reports, experiments. **Credentials are never stored.**
- `agentcore.py` — thin wrappers over the bedrock-agentcore control/data clients; every wrapper takes an explicit `client` so tests pass stubs that capture kwargs. Payloads mirror the notebook exactly. Also defines the 13 built-in evaluator IDs.
- `deployer.py` — generalized runtime deployer: pip install for ARM64 → zip → S3 → IAM role → `create_agent_runtime` → poll to ACTIVE. `pip_runner`/`sleeper` are injectable for tests.
- `auth.py` — optional shared-password gate (`LAB4_AUTH_PASSWORD`); stateless HMAC-signed cookie sessions (12 h). No-op when the env var is unset (local dev, tests).
- Insights reuses the batch-evaluation API with `insights=` instead of `evaluators=` — the two are mutually exclusive, and only one batch evaluation can be active per account.

### Testing conventions

- Backend tests make **no mutating AWS calls** — inject fake clients/runners and assert on captured payload shapes (see `tests/test_deployer.py`, `test_gateway_setup_payload.py`).
- Frontend tests run in jsdom; `src/test/setup.ts` pins the language to English (`lab4.lang=en`) and stubs `ResizeObserver`/`matchMedia`. i18n tests override the language key explicitly.

### Credentials

The backend defaults to boto3's provider chain (the EC2 IAM role on this host). Requests may carry per-session `creds` — used only for that request, never written to disk, logged, or stored in the browser.
