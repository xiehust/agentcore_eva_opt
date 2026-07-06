"""AWS session factory + client helpers.

Credentials resolution:
  * If a request supplies access key + secret, build a *scoped* session for that
    request only (optionally with session token + region).
  * Otherwise fall back to boto3's default provider chain — which on this EC2
    host resolves the attached IAM role.

No credential value is ever written to disk or logged.
"""

from __future__ import annotations

import boto3

from .models import Creds

DEFAULT_REGION = "us-west-2"


def get_session(creds: Creds | None) -> boto3.Session:
    """Return a boto3 Session from optional per-request creds, else the default chain."""
    region = (creds.region if creds and creds.region else None) or DEFAULT_REGION
    if creds and creds.accessKeyId and creds.secretAccessKey:
        return boto3.Session(
            aws_access_key_id=creds.accessKeyId,
            aws_secret_access_key=creds.secretAccessKey,
            aws_session_token=creds.sessionToken or None,
            region_name=region,
        )
    # Default provider chain (EC2 instance role, env vars, shared config, ...).
    return boto3.Session(region_name=region)


# ─── Client helpers ─────────────────────────────────────────────────────────
def control(session: boto3.Session):
    """bedrock-agentcore control plane client."""
    return session.client("bedrock-agentcore-control")


def data(session: boto3.Session):
    """bedrock-agentcore data plane client."""
    return session.client("bedrock-agentcore")


def sts(session: boto3.Session):
    return session.client("sts")


def logs(session: boto3.Session):
    return session.client("logs")


def xray(session: boto3.Session):
    return session.client("xray")
