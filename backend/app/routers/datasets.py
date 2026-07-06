"""Evaluation-dataset CRUD (console resources backed by SQLite)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException

from .. import db
from ..models import DatasetCreateRequest, DatasetUpdateRequest

router = APIRouter(prefix="/api", tags=["datasets"])


def _get_or_404(dataset_id: str) -> dict[str, Any]:
    dataset = db.get_dataset(dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="unknown dataset id")
    return dataset


@router.get("/datasets")
def list_datasets() -> dict[str, Any]:
    return {"datasets": db.list_datasets()}


@router.post("/datasets", status_code=201)
def create_dataset(req: DatasetCreateRequest) -> dict[str, Any]:
    dataset_id = uuid.uuid4().hex[:12]
    db.create_dataset(
        dataset_id,
        name=req.name,
        description=req.description,
        items=[i.model_dump(exclude_none=True) for i in req.items],
    )
    return _get_or_404(dataset_id)


@router.get("/datasets/{dataset_id}")
def get_dataset(dataset_id: str) -> dict[str, Any]:
    return _get_or_404(dataset_id)


@router.put("/datasets/{dataset_id}")
def update_dataset(dataset_id: str, req: DatasetUpdateRequest) -> dict[str, Any]:
    _get_or_404(dataset_id)
    db.update_dataset(
        dataset_id,
        name=req.name,
        description=req.description,
        items=(
            [i.model_dump(exclude_none=True) for i in req.items]
            if req.items is not None
            else None
        ),
    )
    return _get_or_404(dataset_id)


@router.delete("/datasets/{dataset_id}")
def delete_dataset(dataset_id: str) -> dict[str, Any]:
    _get_or_404(dataset_id)
    db.delete_dataset(dataset_id)
    return {"ok": True}
