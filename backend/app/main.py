"""FastAPI application entrypoint for the Live-AWS backend.

Run: uv run uvicorn app.main:app --port 8787
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db, jobs
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


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "lab4-live-backend", "docs": "/docs"}
