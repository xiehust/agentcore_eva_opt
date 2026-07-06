"""Generalized deployer: package build, role setup, runtime creation (fakes only)."""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path
from typing import Any

import pytest

from app import deployer


class FakeCompleted:
    returncode = 0
    stderr = ""


class FakePipRunner:
    def __init__(self, returncode: int = 0, stderr: str = "") -> None:
        self.calls: list[list[str]] = []
        self.returncode = returncode
        self.stderr = stderr

    def __call__(self, argv: list[str], **kwargs: Any) -> Any:
        self.calls.append(argv)

        class R:
            returncode = self.returncode
            stderr = self.stderr

        return R()


class FakeS3:
    class exceptions:
        class BucketAlreadyOwnedByYou(Exception):
            pass

        class BucketAlreadyExists(Exception):
            pass

    def __init__(self) -> None:
        self.uploads: list[tuple[str, str, str]] = []
        self.buckets: list[str] = []

    def create_bucket(self, Bucket: str, **kwargs: Any) -> None:
        self.buckets.append(Bucket)

    def upload_file(self, path: str, bucket: str, key: str) -> None:
        self.uploads.append((path, bucket, key))


class FakeIam:
    class _EntityExists(Exception):
        pass

    class exceptions:
        pass

    exceptions.EntityAlreadyExistsException = _EntityExists  # type: ignore[attr-defined]

    def __init__(self, exists: bool = False) -> None:
        self.exists = exists
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def create_role(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("create_role", kwargs))
        if self.exists:
            raise self._EntityExists()
        return {"Role": {"Arn": f"arn:aws:iam::123:role/{kwargs['RoleName']}"}}

    def get_role(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("get_role", kwargs))
        return {"Role": {"Arn": f"arn:aws:iam::123:role/{kwargs['RoleName']}"}}

    def put_role_policy(self, **kwargs: Any) -> None:
        self.calls.append(("put_role_policy", kwargs))


class FakeControl:
    def __init__(self, statuses: list[str] | None = None) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.statuses = statuses or ["CREATING", "ACTIVE"]
        self._i = 0

    def create_agent_runtime(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("create_agent_runtime", kwargs))
        return {
            "agentRuntimeArn": "arn:aws:bedrock-agentcore:::runtime/r-1",
            "agentRuntimeId": "r-1",
        }

    def get_agent_runtime(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("get_agent_runtime", kwargs))
        status = self.statuses[min(self._i, len(self.statuses) - 1)]
        self._i += 1
        return {"status": status, "agentRuntimeArn": "arn:aws:bedrock-agentcore:::runtime/r-1"}


class FakeSession:
    region_name = "us-west-2"

    def __init__(self) -> None:
        self.s3 = FakeS3()
        self.iam = FakeIam()
        self.controlc = FakeControl()

    def client(self, name: str) -> Any:
        return {
            "s3": self.s3,
            "iam": self.iam,
            "bedrock-agentcore-control": self.controlc,
            "sts": _FakeSts(),
        }[name]


class _FakeSts:
    def get_caller_identity(self) -> dict[str, str]:
        return {"Account": "123456789012"}


def test_sanitize_runtime_name() -> None:
    name = deployer.sanitize_runtime_name("My Agent! (v2)")
    assert name.startswith("MyAgentv2")
    assert name.isalnum()
    # Uniqueness suffix present
    assert len(name) > len("MyAgentv2")


def test_build_package_includes_extra_requirements(tmp_path: Path) -> None:
    pip = FakePipRunner()
    s3 = FakeS3()
    uri = deployer.build_deployment_package(
        s3,
        agent_code="print('agent')",
        extra_requirements=["requests>=2", "  "],  # blank entries dropped
        build_dir=tmp_path / "build",
        s3_bucket="bkt",
        s3_key="k/pkg.zip",
        region="us-west-2",
        pip_runner=pip,
    )
    assert uri == "s3://bkt/k/pkg.zip"
    argv = pip.calls[0]
    for base in deployer.BASE_REQUIREMENTS:
        assert base in argv
    assert "requests>=2" in argv
    assert "  " not in argv
    assert "manylinux2014_aarch64" in argv
    # The zip contains the agent code as main.py.
    zip_path = tmp_path / "build" / "deployment_package.zip"
    with zipfile.ZipFile(io.BytesIO(zip_path.read_bytes())) as zf:
        assert zf.read("main.py").decode() == "print('agent')"
    assert s3.uploads == [(str(zip_path), "bkt", "k/pkg.zip")]


def test_build_package_surfaces_pip_stderr(tmp_path: Path) -> None:
    pip = FakePipRunner(returncode=1, stderr="no matching aarch64 wheel")
    with pytest.raises(RuntimeError, match="no matching aarch64 wheel"):
        deployer.build_deployment_package(
            FakeS3(),
            agent_code="x",
            extra_requirements=["weird-src-only-pkg"],
            build_dir=tmp_path / "build",
            s3_bucket="bkt",
            s3_key="k",
            region="us-west-2",
            pip_runner=pip,
        )


def test_setup_execution_role_new_role_sleeps_for_propagation() -> None:
    iam = FakeIam()
    slept: list[float] = []
    arn = deployer.setup_execution_role(
        iam, role_name="BedrockAgentCore-x", account_id="123", sleeper=slept.append
    )
    assert arn.endswith("role/BedrockAgentCore-x")
    assert slept == [30.0]
    trust = json.loads(iam.calls[0][1]["AssumeRolePolicyDocument"])
    assert trust["Statement"][0]["Principal"]["Service"] == "bedrock-agentcore.amazonaws.com"


def test_setup_execution_role_existing_role_no_sleep() -> None:
    iam = FakeIam(exists=True)
    slept: list[float] = []
    deployer.setup_execution_role(
        iam, role_name="BedrockAgentCore-x", account_id="123", sleeper=slept.append
    )
    assert slept == []


def test_deploy_agent_code_full_flow(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    session = FakeSession()
    progress: list[str] = []
    result = deployer.deploy_agent_code(
        session,
        runtime_name="Agent1abc123",
        code="print('agent')",
        extra_requirements=[],
        progress=progress.append,
        pip_runner=FakePipRunner(),
        sleeper=lambda _s: None,
    )
    assert result["runtimeId"] == "r-1"
    assert result["logGroup"] == "/aws/bedrock-agentcore/runtimes/r-1-DEFAULT"
    assert result["serviceName"] == "Agent1abc123.DEFAULT"
    assert result["region"] == "us-west-2"
    _, kwargs = session.controlc.calls[0]
    cc = kwargs["agentRuntimeArtifact"]["codeConfiguration"]
    assert cc["runtime"] == "PYTHON_3_13"
    assert cc["entryPoint"] == ["opentelemetry-instrument", "main.py"]
    assert cc["code"]["s3"]["bucket"] == "bedrock-agentcore-code-123456789012-us-west-2"
    assert kwargs["networkConfiguration"] == {"networkMode": "PUBLIC"}
    assert any("ACTIVE" in m for m in progress)


def test_deploy_agent_code_failed_runtime_raises() -> None:
    session = FakeSession()
    session.controlc.statuses = ["CREATE_FAILED"]
    with pytest.raises(RuntimeError, match="Runtime failed"):
        deployer.deploy_agent_code(
            session,
            runtime_name="Agent1abc123",
            code="x",
            pip_runner=FakePipRunner(),
            sleeper=lambda _s: None,
        )
