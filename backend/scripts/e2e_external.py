"""End-to-end EXTERNAL-AGENT evaluation against real AWS.

Proves the whole external-agent chain with the local demo agent:

  1. start demo-agent locally (full OTEL → CloudWatch via ADOT)
  2. register it in the console backend as an external agent (with invoke URL)
  3. telemetry-check until spans land in aws/spans (hard gate)
  4. ACTIVE run: 3-item dataset → HTTP invoker → batch eval → scores
  5. PASSIVE run: lookback window → batch eval → scores
  6. finally: delete run rows/dataset/agent via API, kill the demo agent

Costs real money (Bedrock inference + LLM evaluators) and takes ~15–30 min
(spans land in ~2–5 min; each batch evaluation ~5–10 min; only ONE batch
evaluation can be active per account, so the two runs are sequential).

Run: cd backend && uv run python scripts/e2e_external.py
Requires: backend on :8787 (started if absent), demo-agent uv-synced,
CloudWatch Transaction Search enabled, EC2 role creds.

Log groups / span data are intentionally left in place (log data, mirrors
e2e_live conventions). No AWS resources are created beyond telemetry.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

# Point at a dedicated backend (E2E_BACKEND_PORT=8788) to avoid a prod
# instance with auth enabled on :8787.
BACKEND = f"http://127.0.0.1:{os.environ.get('E2E_BACKEND_PORT', '8787')}/api"
DEMO = "http://127.0.0.1:9100"
REPO = Path(__file__).resolve().parents[2]

TELEMETRY_GATE_TIMEOUT = 600  # s — spans usually land in 2–5 min
RUN_TIMEOUT = 1500  # s per evaluation run


def api(method: str, path: str, body: dict | None = None) -> dict:
    request = urllib.request.Request(
        f"{BACKEND}{path}",
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(request, timeout=60) as resp:
        return json.loads(resp.read().decode())


def wait_job(job_id: str, timeout: float, label: str) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        status = api("GET", f"/jobs/{job_id}")
        if status["state"] in ("completed", "failed"):
            return status
        progress = status.get("progress") or status["state"]
        print(f"    [{label}] {progress}", flush=True)
        time.sleep(15)
    raise TimeoutError(f"{label}: job {job_id} did not finish in {timeout}s")


def wait_http(url: str, timeout: float = 60) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=5):
                return
        except Exception:
            time.sleep(2)
    raise TimeoutError(f"{url} not reachable in {timeout}s")


def main() -> int:
    print("=" * 64)
    print("EXTERNAL-AGENT E2E — demo agent → CloudWatch → evaluations")
    print("=" * 64)

    demo_proc: subprocess.Popen | None = None
    agent_id: str | None = None
    dataset_id: str | None = None
    run_ids: list[str] = []
    failures: list[str] = []

    try:
        # 0. Preflight: backend up?
        wait_http(f"{BACKEND.removesuffix('/api')}/api/agents", timeout=10)
        print("[preflight] backend :8787 OK")

        # 1. Demo agent with full OTEL.
        print("[demo-agent] starting with ADOT telemetry…")
        demo_proc = subprocess.Popen(
            ["bash", str(REPO / "demo-agent" / "run.sh")],
            stdout=open("/tmp/e2e-demo-agent.log", "wb"),
            stderr=subprocess.STDOUT,
        )
        wait_http(f"{DEMO}/healthz", timeout=90)
        print("[demo-agent] healthy on :9100")

        # 2. Register as external agent (invoke binding included).
        agent = api(
            "POST",
            "/agents",
            {
                "name": f"Demo External {time.strftime('%H%M%S')}",
                "description": "e2e external agent (Claude Agent SDK, local)",
                "kind": "external",
                "binding": {
                    "serviceName": "agentxray-demo-agent",
                    "logGroup": "/aws/bedrock-agentcore/runtimes/agentxray-demo-agent",
                    "region": "us-west-2",
                    "invoke": {"url": f"{DEMO}/invoke"},
                },
            },
        )
        agent_id = agent["id"]
        print(f"[register] external agent id={agent_id}")

        # 3. Warm-up traffic so spans exist.
        for i, prompt in enumerate(["What is 17 + 25?", "What time is it in UTC?"]):
            body = json.dumps({"prompt": prompt}).encode()
            req = urllib.request.Request(
                f"{DEMO}/invoke", data=body,
                headers={"Content-Type": "application/json"}, method="POST",
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                out = json.loads(resp.read().decode())
            print(f"[warmup {i + 1}/2] session={out['sessionId']} output={out['output'][:60]!r}")

        # 4. Telemetry gate: retry until spans land.
        print("[telemetry] waiting for spans to land in aws/spans…")
        gate_deadline = time.monotonic() + TELEMETRY_GATE_TIMEOUT
        report: dict = {}
        while time.monotonic() < gate_deadline:
            job = api("POST", f"/agents/{agent_id}/telemetry-check", {"lookbackHours": 1})
            status = wait_job(job["jobId"], 120, "telemetry")
            report = status.get("result") or {}
            if status["state"] == "completed" and report.get("ok"):
                break
            print(f"    not yet: spans={report.get('spans', {}).get('spanCount')} "
                  f"hints={report.get('hints')}")
            time.sleep(30)
        print("[telemetry] report:", json.dumps(report, indent=2))
        if not report.get("ok"):
            failures.append("telemetry gate never passed — aborting evaluations")
            return 1

        # 5. ACTIVE run: dataset → HTTP invoker → batch eval.
        dataset = api(
            "POST",
            "/datasets",
            {
                "name": f"e2e-ext-{time.strftime('%H%M%S')}",
                "items": [
                    {"prompt": "What is 6 * 7? Use the calculator tool."},
                    {"prompt": "What is 100 / 4? Use the calculator tool."},
                    {"prompt": "What time is it right now in UTC?"},
                ],
            },
        )
        dataset_id = dataset["id"]
        print(f"[active] dataset id={dataset_id}; starting run…")
        run = api(
            "POST",
            "/runs",
            {"agentId": agent_id, "datasetId": dataset_id, "waitSeconds": 150},
        )
        run_ids.append(run["runId"])
        status = wait_job(run["jobId"], RUN_TIMEOUT, "active-run")
        if status["state"] != "completed":
            failures.append(f"active run failed: {status.get('error')}")
        else:
            print("[active] scores:", json.dumps(status["result"]["scores"], indent=2))
            if not status["result"]["scores"]:
                failures.append("active run completed but produced no scores")

        # 6. PASSIVE run: lookback over everything above.
        print("[passive] starting lookback run…")
        run = api("POST", "/runs", {"agentId": agent_id, "lookbackHours": 1})
        run_ids.append(run["runId"])
        status = wait_job(run["jobId"], RUN_TIMEOUT, "passive-run")
        if status["state"] != "completed":
            failures.append(f"passive run failed: {status.get('error')}")
        else:
            print("[passive] scores:", json.dumps(status["result"]["scores"], indent=2))
            if not status["result"]["scores"]:
                failures.append("passive run completed but produced no scores")

        return 0 if not failures else 1

    finally:
        print("\n[cleanup] tearing down…")
        for rid in run_ids:
            try:
                api("DELETE", f"/runs/{rid}")
                print(f"  run {rid}: deleted")
            except Exception as exc:  # noqa: BLE001
                print(f"  run {rid}: {exc}")
        if dataset_id:
            try:
                api("DELETE", f"/datasets/{dataset_id}")
                print(f"  dataset {dataset_id}: deleted")
            except Exception as exc:  # noqa: BLE001
                print(f"  dataset {dataset_id}: {exc}")
        if agent_id:
            try:
                api("DELETE", f"/agents/{agent_id}")
                print(f"  agent {agent_id}: deleted")
            except Exception as exc:  # noqa: BLE001
                print(f"  agent {agent_id}: {exc}")
        if demo_proc is not None:
            demo_proc.terminate()
            try:
                demo_proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                demo_proc.kill()
            print("  demo agent: stopped")
        print("  (log groups + span data intentionally left in place)")
        if failures:
            print("\nFAILURES:")
            for f in failures:
                print(" -", f)


if __name__ == "__main__":
    sys.exit(main())
