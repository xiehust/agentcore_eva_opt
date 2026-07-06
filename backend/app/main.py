"""FastAPI application entrypoint for the Live-AWS backend.

Run: uv run uvicorn app.main:app --port 8787

Internet-facing deployments: set LAB4_AUTH_PASSWORD to require a login for
every /api route (see app/auth.py), and build the frontend (`npm run build`)
so this server also hosts the SPA from ../dist — one port behind the ALB.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import auth, db, jobs
from .routers import (
    abtest,
    agents,
    bundles,
    cleanup,
    datasets,
    deploy,
    evaluate,
    evaluators,
    experiments,
    health,
    insights,
    recommend,
    runs,
    samples,
    session,
)

app = FastAPI(
    title="lab4-interactive Live-AWS backend",
    description="Real bedrock-agentcore operations behind the lab4-interactive app.",
    version="1.0.0",
)

# Create the SQLite tables on startup so progress persists across restarts.
db.init()

# The frontend dev server (Vite) runs on :5173; the preview server on :4173.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:4173",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Optional shared-password gate for internet-facing deployments (no-op unless
# LAB4_AUTH_PASSWORD is set). Registered after CORS so preflights still work.
app.middleware("http")(auth.middleware)

app.include_router(health.router)
app.include_router(jobs.router)
app.include_router(deploy.router)
app.include_router(bundles.router)
app.include_router(evaluate.router)
app.include_router(evaluators.router)
app.include_router(recommend.router)
app.include_router(abtest.router)
app.include_router(cleanup.router)
app.include_router(session.router)
# Console resources (generic agent-evaluation platform).
app.include_router(agents.router)
app.include_router(datasets.router)
app.include_router(runs.router)
app.include_router(samples.router)
app.include_router(experiments.router)
app.include_router(insights.router)
app.include_router(auth.router)

# ── Static SPA hosting (production single-port mode) ─────────────────────────
# If the frontend has been built (npm run build → ../dist), serve it from this
# process so the ALB needs exactly one target. Assets are content-hashed, the
# shell is served for any non-API path (SPA client routing / deep links).
_DIST = Path(__file__).resolve().parent.parent.parent / "dist"

if (_DIST / "index.html").is_file():
    app.mount("/assets", StaticFiles(directory=_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str) -> FileResponse:
        candidate = (_DIST / full_path).resolve()
        # Serve real files at the dist root (favicon etc.); anything else —
        # including "/" — falls back to the SPA shell. Path is confined to dist.
        if (
            full_path
            and candidate.is_file()
            and candidate.is_relative_to(_DIST)
        ):
            return FileResponse(candidate)
        return FileResponse(_DIST / "index.html")

else:

    @app.get("/")
    def root() -> dict[str, str]:
        return {"service": "lab4-live-backend", "docs": "/docs"}
