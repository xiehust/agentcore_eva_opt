"""Read-only built-in samples (HR agent code v1/v2 + prompt datasets)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from .. import samples

router = APIRouter(prefix="/api", tags=["samples"])


@router.get("/samples/agent")
def get_sample_agent(variant: str = "v1") -> dict[str, Any]:
    try:
        return samples.sample_agent(variant)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/samples/dataset")
def get_sample_dataset() -> dict[str, Any]:
    return samples.sample_dataset()


@router.get("/samples/datasets")
def get_sample_datasets() -> dict[str, Any]:
    return {"datasets": samples.sample_datasets()}
