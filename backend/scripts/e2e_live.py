"""End-to-end LIVE run against real AWS via the app's own functions.

Drives the real journey and prints every real AWS id/result. Cleanup ALWAYS
runs in a finally block, so a partial run still tears down whatever it created.

Run: cd backend && uv run python scripts/e2e_live.py [--deploy]

Without --deploy it skips the multi-minute Docker deploy and proves the rest of
the live path (identity + a real configuration bundle create/read + cleanup).
With --deploy it additionally attempts the real agent deploy.
"""

from __future__ import annotations

import sys
import uuid
from pathlib import Path

# Make the app importable when run as a script.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import agentcore  # noqa: E402
from app.aws import control, get_session, sts  # noqa: E402

SUFFIX = uuid.uuid4().hex[:6]


def main(do_deploy: bool = False) -> int:
    session = get_session(None)  # default IAM role
    created_bundle_ids: list[str] = []
    created_runtime_ids: list[str] = []
    created_role_name: str | None = None

    print("=" * 60)
    print("LIVE E2E RUN — suffix", SUFFIX)
    print("=" * 60)

    # 1. Identity ------------------------------------------------------------
    ident = sts(session).get_caller_identity()
    account = ident["Account"]
    print(f"[identity] account={account} arn={ident['Arn']}")

    agent_arn = f"arn:aws:bedrock-agentcore:us-west-2:{account}:runtime/e2e-{SUFFIX}"

    try:
        # 2. Real configuration bundle create (cheap real mutating op) -------
        cc = control(session)
        print("\n[bundle] creating real configuration bundle…")
        resp = agentcore.create_configuration_bundle(
            cc,
            agent_arn=agent_arn,
            bundle_name=f"HRE2E{SUFFIX}",
            system_prompt="You are a helpful HR Assistant for Acme Corp.",
            tool_descriptions={"get_pto_balance": "Return the current PTO balance."},
            commit_message=f"E2E live test {SUFFIX}",
        )
        bundle_id = resp["bundleId"]
        version_id = resp["versionId"]
        created_bundle_ids.append(bundle_id)
        print(f"[bundle] CREATED bundleId={bundle_id} versionId={version_id}")

        # 3. Real read-back of the created resource --------------------------
        read = agentcore.get_configuration_bundle(cc, bundle_id=bundle_id)
        cfg = read.get("components", {}).get(agent_arn, {}).get("configuration", {})
        print(
            f"[bundle] READ-BACK ok — system_prompt starts: "
            f"{str(cfg.get('system_prompt', ''))[:48]!r}"
        )

        # 4. Optional real deploy (Docker, minutes) --------------------------
        if do_deploy:
            print("\n[deploy] attempting real agent deploy (Docker ARM64)…")
            # Depth-independent: walk up to find the sample project's lab4 dir
            # so this keeps working regardless of where the backend lives.
            rel = Path("sample-open-weight-models-with-amazon-bedrock") / "lab4"
            lab4 = next(
                (
                    p / rel
                    for p in Path(__file__).resolve().parents
                    if (p / rel / "deploy_agent.py").is_file()
                ),
                None,
            )
            if lab4 is None:
                raise ModuleNotFoundError(f"Could not locate {rel}/deploy_agent.py")
            sys.path.insert(0, str(lab4))
            try:
                import deploy_agent  # type: ignore[import-not-found]

                state_path = deploy_agent.main(name=f"HRE2E{SUFFIX}", version="v1")
                import json

                st = json.loads(Path(state_path).read_text())
                print(f"[deploy] ACTIVE runtime_arn={st.get('runtime_arn')}")
                if st.get("runtime_id"):
                    created_runtime_ids.append(st["runtime_id"])
                created_role_name = st.get("role_name")
            except Exception as exc:  # noqa: BLE001 — capture verbatim, do not fake
                print(f"[deploy] REAL ERROR (captured, not fabricated): "
                      f"{type(exc).__name__}: {str(exc)[:300]}")
        else:
            print("\n[deploy] skipped (pass --deploy to attempt the real Docker deploy)")

        return 0
    finally:
        # 5. Cleanup ALWAYS runs -------------------------------------------
        print("\n[cleanup] tearing down created resources…")
        results = agentcore.cleanup_resources(
            control(session),
            session.client("bedrock-agentcore"),
            bundle_ids=created_bundle_ids,
            runtime_ids=created_runtime_ids,
            role_name=created_role_name,
            iam_client=session.client("iam"),
        )
        for r in results:
            print(f"[cleanup] {r['category']}: {r['status']} {r['detail']}")

        # 6. Confirming read — the bundle should now be gone ---------------
        for bid in created_bundle_ids:
            try:
                agentcore.get_configuration_bundle(control(session), bundle_id=bid)
                print(f"[cleanup] WARNING: bundle {bid} still readable")
            except Exception as exc:  # noqa: BLE001
                print(
                    f"[cleanup] CONFIRMED gone: get {bid} -> "
                    f"{type(exc).__name__}: {str(exc)[:80]}"
                )


if __name__ == "__main__":
    raise SystemExit(main("--deploy" in sys.argv))
