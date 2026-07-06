# lab4-interactive · Live-AWS backend

FastAPI service that performs the **real** Amazon Bedrock AgentCore operations
behind the `lab4-interactive` app's **Live mode** — deploy, traffic, batch
evaluation, recommendations, configuration bundles, A/B tests, and cleanup.

The simulation mode in the frontend needs none of this; the backend is only
used when the UI is switched to **Live**.

## Credentials

- **Default:** the backend uses boto3's default provider chain, which on this
  EC2 host resolves the attached **IAM role** — no configuration needed.
- **Optional:** a request may carry `creds: {accessKeyId, secretAccessKey,
  sessionToken?, region?}`. These are used only for that request and are
  **never written to disk or logged**.

Default region: `us-west-2` (override per request via `creds.region`).

## Run

```bash
cd backend
uv run uvicorn app.main:app --port 8787
# health:   curl http://localhost:8787/api/health
# identity: curl -XPOST http://localhost:8787/api/identity
```

## Develop

```bash
uv run ruff check .     # lint
uv run pytest -q        # tests (no mutating AWS calls)
```

## Long operations

Deploy, batch evaluation, recommendation, and A/B monitoring run as background
jobs on a worker thread. Endpoints return `{jobId}`; poll `GET /api/jobs/{id}`
until `state` is `completed` or `failed`.

## Persistence (survives restarts)

Job status/results and the frontend's journey snapshot are persisted to a local
**SQLite** database (`backend/data/lab4.db`, WAL mode — created automatically,
gitignored) so a completed deploy/eval and the demo's progress survive a backend
restart or page reload.

- Jobs are mirrored to the `jobs` table; `GET /api/jobs/{id}` rehydrates from it
  when the in-memory cache is empty (e.g. after a restart).
- The frontend saves a credential-free journey snapshot via `PUT /api/session`
  and restores it with `GET /api/session/{id}` on load. **Credentials are never
  persisted** — the snapshot excludes AK/SK and identity.
- Override the DB location with `LAB4_DB_PATH` (tests use `:memory:`).

> ⚠ Live mode creates real AWS resources and incurs cost. Always run the
> cleanup step (`POST /api/cleanup`) when finished.
