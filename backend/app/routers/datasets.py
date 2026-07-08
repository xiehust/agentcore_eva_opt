"""Evaluation-dataset CRUD (local SQLite) + the AWS Dataset resource
lifecycle (CreateDataset/ListDatasets/GetDataset/DeleteDataset, public
preview): local datasets sync one-way to the cloud as inline examples."""

from __future__ import annotations

import time
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException

from .. import agentcore, db, jobs
from ..aws import control, get_session
from ..models import (
    CredsRequest,
    DatasetCreateRequest,
    DatasetUpdateRequest,
    JobRef,
    _validate_scenarios,
)
from ..scenarios import normalize_scenarios

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
    # legacy stores prompt items; scenario kinds store devguide-schema
    # scenarios in the same JSON column.
    if req.kind == "legacy":
        items = [i.model_dump(exclude_none=True) for i in req.items or []]
    else:
        items = req.scenarios or []
    db.create_dataset(
        dataset_id,
        name=req.name,
        description=req.description,
        items=items,
        kind=req.kind,
    )
    return _get_or_404(dataset_id)


@router.get("/datasets/{dataset_id}")
def get_dataset(dataset_id: str) -> dict[str, Any]:
    return _get_or_404(dataset_id)


@router.put("/datasets/{dataset_id}")
def update_dataset(dataset_id: str, req: DatasetUpdateRequest) -> dict[str, Any]:
    dataset = _get_or_404(dataset_id)
    items: list[dict[str, Any]] | None = None
    if dataset["kind"] == "legacy":
        if req.items is not None:
            items = [i.model_dump(exclude_none=True) for i in req.items]
    elif req.scenarios is not None:
        # kind is immutable — re-validate replacement scenarios against it.
        if not req.scenarios:
            raise HTTPException(status_code=422, detail="scenarios is empty")
        try:
            _validate_scenarios(dataset["kind"], req.scenarios)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        items = req.scenarios
    db.update_dataset(
        dataset_id,
        name=req.name,
        description=req.description,
        items=items,
    )
    return _get_or_404(dataset_id)


@router.delete("/datasets/{dataset_id}")
def delete_dataset(dataset_id: str) -> dict[str, Any]:
    _get_or_404(dataset_id)
    db.delete_dataset(dataset_id)
    return {"ok": True}


# ─── AWS cloud datasets ──────────────────────────────────────────────────────
def _map_cloud_dataset(ds: dict[str, Any]) -> dict[str, Any]:
    return {
        "datasetId": ds.get("datasetId"),
        "datasetArn": ds.get("datasetArn"),
        "name": ds.get("datasetName"),
        "description": ds.get("description"),
        "status": ds.get("status"),
        "schemaType": ds.get("schemaType"),
        "exampleCount": ds.get("exampleCount"),
        "createdAt": str(ds["createdAt"]) if ds.get("createdAt") else None,
    }


@router.post("/datasets/{dataset_id}/sync-to-aws", response_model=JobRef)
def sync_dataset_to_aws(dataset_id: str, req: CredsRequest) -> JobRef:
    """Create an AWS Dataset resource from the local dataset (inline
    examples), poll it to ACTIVE, and record the cloud copy on the row."""
    dataset = _get_or_404(dataset_id)
    kind = dataset["kind"]
    # Legacy prompt lists sync as normalized single-turn predefined scenarios.
    examples = normalize_scenarios(dataset)
    schema_type = agentcore.DATASET_SCHEMA_TYPES[kind]
    name = agentcore.sanitize_dataset_name(dataset["name"])

    def _run(progress: Any) -> dict[str, Any]:
        client = control(get_session(req.creds))
        progress(f"creating AWS dataset {name}")
        created = agentcore.create_dataset(
            client,
            name=name,
            schema_type=schema_type,
            examples=examples,
            description=dataset.get("description") or "",
        )
        cloud_id = created["datasetId"]
        final = agentcore.poll_dataset_active(
            client, dataset_id=cloud_id, progress=progress
        )
        cloud = {
            "datasetId": cloud_id,
            "datasetArn": final.get("datasetArn"),
            "datasetName": name,
            "status": final.get("status"),
            "exampleCount": final.get("exampleCount"),
            "syncedAt": time.time(),
        }
        db.update_dataset(dataset_id, cloud=cloud)
        return cloud

    return JobRef(jobId=jobs.start_job(_run))


@router.post("/datasets/cloud/list")
def list_cloud_datasets(req: CredsRequest) -> dict[str, Any]:
    client = control(get_session(req.creds))
    return {"datasets": [_map_cloud_dataset(d) for d in agentcore.list_datasets(client)]}


@router.post("/datasets/cloud/{cloud_id}/get")
def get_cloud_dataset(cloud_id: str, req: CredsRequest) -> dict[str, Any]:
    client = control(get_session(req.creds))
    ds = agentcore.get_dataset(client, dataset_id=cloud_id)
    mapped = _map_cloud_dataset(ds)
    mapped["downloadUrl"] = ds.get("downloadUrl")
    return mapped


@router.delete("/datasets/cloud/{cloud_id}")
def delete_cloud_dataset(cloud_id: str) -> dict[str, Any]:
    client = control(get_session(None))
    agentcore.delete_dataset(client, dataset_id=cloud_id)
    # If a local row references this cloud dataset, mark its copy deleted.
    for local in db.list_datasets():
        cloud = local.get("cloud")
        if cloud and cloud.get("datasetId") == cloud_id:
            db.update_dataset(local["id"], cloud={**cloud, "status": "deleted"})
    return {"datasetId": cloud_id, "deleted": True}
