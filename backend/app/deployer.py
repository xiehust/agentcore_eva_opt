"""Generalized AgentCore Runtime deployer for user-authored agent code.

Adapted from ``sample-open-weight-models-with-amazon-bedrock/lab4/deploy_agent.py``
but parameterized so the console can deploy *any* agent:

  * the agent code is a plain string argument (no fixed source file, no
    v1/v2 string mutation),
  * extra pip requirements can be appended to the fixed base set,
  * all AWS clients come from a request-scoped ``boto3.Session`` (so
    per-request credentials work),
  * no ``agent_state_*.json`` is written to disk — the caller persists the
    returned deployment dict (in the ``agents`` table),
  * ``pip_runner`` / ``sleeper`` are injectable for tests.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import time
import uuid
import zipfile
from collections.abc import Callable
from pathlib import Path
from typing import Any

# Deps every AgentCore runtime package needs (the console UI shows these as
# read-only; users may add their own on top per agent).
BASE_REQUIREMENTS = [
    "strands-agents[otel]",
    "bedrock-agentcore",
    "aws-opentelemetry-distro",
]


def sanitize_runtime_name(name: str) -> str:
    """AgentCore runtime names must be alphanumeric — sanitize + suffix for uniqueness."""
    base = re.sub(r"[^A-Za-z0-9]", "", name)[:24] or "agent"
    return f"{base}{uuid.uuid4().hex[:6]}"


def setup_execution_role(
    iam_client: Any,
    *,
    role_name: str,
    account_id: str,
    sleeper: Callable[[float], None] = time.sleep,
    propagation_sleep: float = 30.0,
) -> str:
    """Create (or reuse) the AgentCore execution role. Returns its ARN."""
    trust_policy = json.dumps(
        {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": {"Service": "bedrock-agentcore.amazonaws.com"},
                    "Action": "sts:AssumeRole",
                    "Condition": {
                        "StringEquals": {"aws:SourceAccount": account_id},
                        "ArnLike": {
                            "aws:SourceArn": f"arn:aws:bedrock-agentcore:*:{account_id}:*"
                        },
                    },
                }
            ],
        }
    )
    permissions_policy = json.dumps(
        {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Action": [
                        "bedrock-agentcore:*",
                        "bedrock:InvokeModel",
                        "bedrock:InvokeModelWithResponseStream",
                        "logs:CreateLogGroup",
                        "logs:CreateLogStream",
                        "logs:PutLogEvents",
                        "logs:DescribeLogGroups",
                        "logs:DescribeIndexPolicies",
                        "logs:PutIndexPolicy",
                        "logs:FilterLogEvents",
                        "logs:GetLogEvents",
                        "logs:StartQuery",
                        "logs:GetQueryResults",
                        "logs:StopQuery",
                        "cloudwatch:*",
                        "xray:PutTraceSegments",
                        "xray:PutTelemetryRecords",
                        "sts:AssumeRole",
                        "s3:GetObject",
                        "s3:ListBucket",
                    ],
                    "Resource": "*",
                }
            ],
        }
    )
    try:
        resp = iam_client.create_role(
            RoleName=role_name, AssumeRolePolicyDocument=trust_policy
        )
        role_arn = resp["Role"]["Arn"]
        created = True
    except iam_client.exceptions.EntityAlreadyExistsException:
        role_arn = iam_client.get_role(RoleName=role_name)["Role"]["Arn"]
        created = False
    iam_client.put_role_policy(
        RoleName=role_name,
        PolicyName="AgentCoreRuntimePolicy",
        PolicyDocument=permissions_policy,
    )
    if created:
        # New roles need time to propagate before create_agent_runtime sees them.
        sleeper(propagation_sleep)
    return role_arn


def build_deployment_package(
    s3_client: Any,
    *,
    agent_code: str,
    extra_requirements: list[str],
    build_dir: Path,
    s3_bucket: str,
    s3_key: str,
    region: str,
    pip_runner: Callable[..., Any] = subprocess.run,
) -> str:
    """pip-install deps for ARM64/py3.13, add the code as main.py, zip, upload.

    Returns the s3:// URI of the uploaded bundle. Raises RuntimeError with pip
    stderr if dependency installation fails (e.g. a source-only extra
    requirement that has no aarch64 wheel).
    """
    if build_dir.exists():
        shutil.rmtree(build_dir)
    pkg_dir = build_dir / "pkg"
    pkg_dir.mkdir(parents=True)

    requirements = BASE_REQUIREMENTS + [r for r in extra_requirements if r.strip()]
    proc = pip_runner(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            *requirements,
            "-t",
            str(pkg_dir),
            "--platform",
            "manylinux2014_aarch64",
            "--only-binary=:all:",
            "--python-version",
            "3.13",
            "--quiet",
        ],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        stderr = (proc.stderr or "").strip()[-2000:]
        raise RuntimeError(f"pip install failed for {requirements}: {stderr}")

    (pkg_dir / "main.py").write_text(agent_code)

    zip_path = build_dir / "deployment_package.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _, files in os.walk(pkg_dir):
            for f in files:
                if f.endswith(".pyc") or "__pycache__" in root:
                    continue
                full = Path(root) / f
                zf.write(full, full.relative_to(pkg_dir))

    try:
        if region == "us-east-1":
            s3_client.create_bucket(Bucket=s3_bucket)
        else:
            s3_client.create_bucket(
                Bucket=s3_bucket,
                CreateBucketConfiguration={"LocationConstraint": region},
            )
    except (
        s3_client.exceptions.BucketAlreadyOwnedByYou,
        s3_client.exceptions.BucketAlreadyExists,
    ):
        pass

    s3_client.upload_file(str(zip_path), s3_bucket, s3_key)
    return f"s3://{s3_bucket}/{s3_key}"


def deploy_agent_code(
    session: Any,
    *,
    runtime_name: str,
    code: str,
    extra_requirements: list[str] | None = None,
    progress: Callable[[str], None] = lambda _msg: None,
    pip_runner: Callable[..., Any] = subprocess.run,
    sleeper: Callable[[float], None] = time.sleep,
    poll_interval: float = 10.0,
    max_polls: int = 90,
) -> dict[str, Any]:
    """Build, upload, and deploy ``code`` as an AgentCore runtime; poll to ACTIVE.

    Returns {runtimeArn, runtimeId, logGroup, serviceName, roleArn, roleName, region}.
    """
    region = session.region_name
    control = session.client("bedrock-agentcore-control")
    account_id = session.client("sts").get_caller_identity()["Account"]

    role_name = f"BedrockAgentCore-{runtime_name}"
    s3_bucket = f"bedrock-agentcore-code-{account_id}-{region}"
    s3_key = f"{runtime_name}/deployment_package.zip"
    build_dir = Path(f"/tmp/{runtime_name}_build")  # nosec B108

    progress("Building deployment package (pip install for ARM64)")
    build_deployment_package(
        session.client("s3"),
        agent_code=code,
        extra_requirements=extra_requirements or [],
        build_dir=build_dir,
        s3_bucket=s3_bucket,
        s3_key=s3_key,
        region=region,
        pip_runner=pip_runner,
    )

    progress("Setting up IAM execution role")
    role_arn = setup_execution_role(
        session.client("iam"),
        role_name=role_name,
        account_id=account_id,
        sleeper=sleeper,
    )

    progress("Creating AgentCore runtime")
    resp = control.create_agent_runtime(
        agentRuntimeName=runtime_name,
        agentRuntimeArtifact={
            "codeConfiguration": {
                "code": {"s3": {"bucket": s3_bucket, "prefix": s3_key}},
                "runtime": "PYTHON_3_13",
                "entryPoint": ["opentelemetry-instrument", "main.py"],
            }
        },
        networkConfiguration={"networkMode": "PUBLIC"},
        roleArn=role_arn,
    )
    runtime_arn = resp["agentRuntimeArn"]
    runtime_id = resp["agentRuntimeId"]

    for i in range(max_polls):
        detail = control.get_agent_runtime(agentRuntimeId=runtime_id)
        status = detail.get("status", "UNKNOWN")
        progress(f"Runtime status: {status} (poll {i + 1})")
        if status in ("ACTIVE", "READY"):
            runtime_arn = detail.get("agentRuntimeArn", runtime_arn)
            break
        if "FAILED" in status:
            raise RuntimeError(f"Runtime failed: {detail.get('failureReason')}")
        sleeper(poll_interval)
    else:
        raise RuntimeError("Runtime did not become ready in time")

    return {
        "runtimeArn": runtime_arn,
        "runtimeId": runtime_id,
        "logGroup": f"/aws/bedrock-agentcore/runtimes/{runtime_id}-DEFAULT",
        "serviceName": f"{runtime_name}.DEFAULT",
        "roleArn": role_arn,
        "roleName": role_name,
        "region": region,
    }
