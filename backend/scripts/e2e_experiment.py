#!/usr/bin/env python3
"""Drive the optimization experiment through the console API, mirroring the
frontend ExperimentsPage orchestration exactly (persist jobId before polling,
PUT results + stage bumps into the experiment artifacts)."""
import json
import sys
import time
import urllib.request

BASE = "http://localhost:8787/api"


def req(method: str, path: str, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(
        f"{BASE}{path}", data=data, method=method,
        headers={"Content-Type": "application/json"} if data else {},
    )
    with urllib.request.urlopen(r) as resp:
        return json.load(resp)


def poll_job(job_id: str, label: str, timeout_s: int = 1500):
    start = time.time()
    last = ""
    while True:
        j = req("GET", f"/jobs/{job_id}")
        line = f"{j['state']} | {j.get('progress') or ''}"
        if line != last:
            print(f"  [{label}] {line}", flush=True)
            last = line
        if j["state"] == "completed":
            return j["result"]
        if j["state"] == "failed":
            raise RuntimeError(f"{label} failed: {j.get('error')}")
        if time.time() - start > timeout_s:
            raise TimeoutError(f"{label} timed out")
        time.sleep(15)


def put_artifacts(exp_id: str, artifacts: dict, stage: str | None = None):
    body = {"artifacts": artifacts}
    if stage:
        body["stage"] = stage
    return req("PUT", f"/experiments/{exp_id}", body)


# experimentNames.ts logic transliterated
def alnum(s: str) -> str:
    return "".join(c for c in s if c.isalnum())


def names(exp_id: str, agent_name: str, challenger_name: str = ""):
    i = alnum(exp_id)[:12]
    t1 = "t1" + (alnum(agent_name)[:20] or "agent")
    t2 = "t2" + (alnum(challenger_name)[:20] or "challenger")
    if t2[2:] == t1[2:]:
        t2 += "V2"
    return {
        "gateway": f"xrgw-{i}", "targetV1": t1, "targetV2": t2,
        "onlineEvalV1": f"xreval{i}", "onlineEvalV2": f"xrevalv2{i}",
        "bundleAbTest": f"xrbundle{i}", "targetAbTest": f"xrtarget{i}",
        "controlBundle": f"xrctl{i}", "treatmentBundle": f"xrtrt{i}",
        "spRec": f"xrsp{i}", "tdRec": f"xrtd{i}",
    }


def monitor_ab(ab_test_id: str, label: str, timeout_s: int = 1500):
    start = time.time()
    while True:
        res = req("GET", f"/abtest/{ab_test_id}")
        ts = res.get("analysisTimestamp")
        metrics = res.get("metrics") or []
        print(f"  [{label}] {res.get('status')}/{res.get('executionStatus')} "
              f"{'analyzed' if ts else 'aggregating'} metrics={len(metrics)}", flush=True)
        if ts and metrics:
            return res
        if time.time() - start > timeout_s:
            raise TimeoutError(f"{label} aggregation timed out")
        time.sleep(30)


def main():
    stage = sys.argv[1]
    env = {}
    with open("/tmp/e2e_ids.env") as f:
        for line in f:
            for kv in line.split():
                if "=" in kv:
                    k, v = kv.split("=", 1)
                    env[k] = v
    exp_id = env["EXP_ID"]
    exp = req("GET", f"/experiments/{exp_id}")
    agent = req("GET", f"/agents/{exp['agentId']}")
    dep = agent["deployment"]
    config = agent["config"]
    n = names(exp_id, exp["agentName"], "HR Assistant v2 (sample)")
    a = exp["artifacts"]

    if stage == "recommend":
        # System-prompt recommendation
        sp_job = req("POST", "/recommend/system-prompt", {
            "name": n["spRec"], "systemPrompt": config["systemPrompt"],
            "logGroupArns": [dep["logGroup"]], "serviceNames": [dep["serviceName"]],
        })["jobId"]
        put_artifacts(exp_id, {"recommendSpJobId": sp_job})
        sp = poll_job(sp_job, "recommend-sp")
        put_artifacts(exp_id, {
            "recommendedSystemPrompt": sp["recommendedSystemPrompt"],
            "usedFallbackSp": sp.get("usedFallback", False),
        })
        print(f"  sp usedFallback={sp.get('usedFallback')} len={len(sp['recommendedSystemPrompt'])}")

        # Tool-description recommendation
        td_job = req("POST", "/recommend/tool-descriptions", {
            "name": n["tdRec"],
            "tools": [{"toolName": k, "description": v} for k, v in config["toolDescriptions"].items()],
            "logGroupArns": [dep["logGroup"]], "serviceNames": [dep["serviceName"]],
        })["jobId"]
        put_artifacts(exp_id, {"recommendTdJobId": td_job})
        td = poll_job(td_job, "recommend-td")
        put_artifacts(exp_id, {
            "recommendedToolDescriptions": td["recommendedToolDescriptions"],
            "usedFallbackTd": td.get("usedFallback", False),
        })
        print(f"  td usedFallback={td.get('usedFallback')}")

        # Accept (as the UI's accept button does)
        exp = req("GET", f"/experiments/{exp_id}")
        a = exp["artifacts"]
        put_artifacts(exp_id, {
            "acceptedSystemPrompt": a["recommendedSystemPrompt"],
            "acceptedToolDescriptions": a["recommendedToolDescriptions"],
        }, stage="bundles")
        print("ACCEPTED → bundles")

    elif stage == "bundles":
        control = req("POST", "/bundles", {
            "agentArn": dep["runtimeArn"], "name": n["controlBundle"],
            "systemPrompt": config["systemPrompt"],
            "toolDescriptions": config["toolDescriptions"],
            "commitMessage": "Control: current config",
        })
        treatment = req("POST", "/bundles", {
            "agentArn": dep["runtimeArn"], "name": n["treatmentBundle"],
            "systemPrompt": a["acceptedSystemPrompt"],
            "toolDescriptions": a["acceptedToolDescriptions"],
            "commitMessage": "Treatment: accepted recommendation",
        })
        put_artifacts(exp_id, {
            "controlBundleId": control["bundleId"], "controlBundleVersion": control["versionId"],
            "treatmentBundleId": treatment["bundleId"], "treatmentBundleVersion": treatment["versionId"],
        }, stage="abtest")
        print(f"BUNDLES control={control['bundleId']}@{control['versionId']} "
              f"treatment={treatment['bundleId']}@{treatment['versionId']}")

    elif stage == "absetup":
        gw_job = req("POST", "/gateway/setup", {
            "name": n["gateway"], "roleArn": dep.get("roleArn") or "",
            "agentArn": dep["runtimeArn"], "targetName": n["targetV1"],
            "onlineEvalName": n["onlineEvalV1"], "logGroup": dep["logGroup"],
            "serviceName": dep["serviceName"],
            "description": f"Experiment {exp_id} gateway",
        })["jobId"]
        put_artifacts(exp_id, {"gatewaySetupJobId": gw_job, "targetNameV1": n["targetV1"]})
        gw = poll_job(gw_job, "gateway-setup")
        put_artifacts(exp_id, {
            "gatewayId": gw["gatewayId"], "gatewayArn": gw["gatewayArn"],
            "roleArn": gw["roleArn"], "targetIdV1": gw["targetId"],
            "onlineEvalArnV1": gw["onlineEvalArn"], "onlineEvalIdV1": gw["onlineEvalId"],
        })
        ab = req("POST", "/abtest/config-bundle", {
            "name": n["bundleAbTest"], "gatewayArn": gw["gatewayArn"],
            "roleArn": gw["roleArn"], "onlineEvalArn": gw["onlineEvalArn"],
            "controlBundleArn": a["controlBundleId"], "controlVersion": a["controlBundleVersion"],
            "treatmentBundleArn": a["treatmentBundleId"], "treatmentVersion": a["treatmentBundleVersion"],
        })
        put_artifacts(exp_id, {"bundleAbTestId": ab["abTestId"]})
        print(f"AB SETUP gw={gw['gatewayId']} ab={ab['abTestId']}")

    elif stage == "abtraffic":
        ds = req("GET", f"/datasets/{env['DS_GATEWAY']}")
        job = req("POST", "/gateway/traffic", {
            "gatewayId": a["gatewayId"], "targetName": a["targetNameV1"],
            "prompts": [{"prompt": i["prompt"], "context": i.get("context")} for i in ds["items"]],
        })["jobId"]
        put_artifacts(exp_id, {"gwTrafficJobId": job, "gwTrafficDatasetId": ds["id"]})
        result = poll_job(job, "gw-traffic")
        put_artifacts(exp_id, {"gwTrafficCount": result["count"]}, stage="monitor")
        print(f"TRAFFIC sent={result['count']} failed={result.get('failed')}")

    elif stage == "abmonitor":
        res = monitor_ab(a["bundleAbTestId"], "bundle-ab")
        put_artifacts(exp_id, {
            "bundleMetrics": res["metrics"], "bundleAnalysisAt": str(res["analysisTimestamp"]),
        })
        print("METRICS:")
        for m in res["metrics"]:
            v = m["variants"][0]
            print(f"  {m['label']}: C={m['control']['mean']:.3f}(n={m['control']['sampleSize']}) "
                  f"T1={v['mean']:.3f}(n={v['sampleSize']}) Δ={v['percentChange']:+.1f}% "
                  f"p={v['pValue']:.3f} sig={v['isSignificant']}")

    elif stage == "promote":
        res = req("POST", f"/bundles/{a['controlBundleId']}/version", {
            "agentArn": dep["runtimeArn"],
            "systemPrompt": a["acceptedSystemPrompt"],
            "toolDescriptions": a["acceptedToolDescriptions"],
            "parentVersionIds": [a["controlBundleVersion"]],
            "commitMessage": "Promote treatment (A/B validated)",
        })
        put_artifacts(exp_id, {"promotedVersionId": res["versionId"]}, stage="promoted")
        print(f"PROMOTED newVersion={res['versionId']}")

    elif stage == "canarysetup":
        req("PUT", f"/experiments/{exp_id}", {"challengerAgentId": env["V2_ID"]})
        challenger = req("GET", f"/agents/{env['V2_ID']}")
        cd = challenger["deployment"]
        job = req("POST", "/abtest/target-setup", {
            "name": n["targetAbTest"], "gatewayId": a["gatewayId"],
            "gatewayArn": a["gatewayArn"], "roleArn": a["roleArn"],
            "agentArnV2": cd["runtimeArn"], "targetNameV1": a["targetNameV1"],
            "targetNameV2": n["targetV2"], "onlineEvalNameV2": n["onlineEvalV2"],
            "logGroupV2": cd["logGroup"], "serviceNameV2": cd["serviceName"],
            "onlineEvalArnV1": a["onlineEvalArnV1"], "bundleAbTestId": a["bundleAbTestId"],
        })["jobId"]
        put_artifacts(exp_id, {"targetSetupJobId": job, "targetNameV2": n["targetV2"]})
        result = poll_job(job, "target-setup")
        put_artifacts(exp_id, {
            "targetIdV2": result["targetIdV2"], "onlineEvalArnV2": result["onlineEvalArnV2"],
            "onlineEvalIdV2": result["onlineEvalIdV2"], "targetAbTestId": result["abTestId"],
            "weights": {"control": 90, "treatment": 10},
        }, stage="canary")
        print(f"CANARY SETUP targetV2={result['targetIdV2']} ab={result['abTestId']}")

    elif stage == "canarytraffic":
        ds = req("GET", f"/datasets/{env['DS_TARGET']}")
        job = req("POST", "/gateway/traffic", {
            "gatewayId": a["gatewayId"], "targetName": a["targetNameV2"],
            "prompts": [{"prompt": i["prompt"], "context": i.get("context")} for i in ds["items"]],
        })["jobId"]
        put_artifacts(exp_id, {"targetTrafficJobId": job, "targetTrafficDatasetId": ds["id"]})
        result = poll_job(job, "canary-traffic")
        put_artifacts(exp_id, {"targetTrafficCount": result["count"]}, stage="canary_monitor")
        print(f"CANARY TRAFFIC sent={result['count']} failed={result.get('failed')}")

    elif stage == "canarymonitor":
        res = monitor_ab(a["targetAbTestId"], "target-ab")
        put_artifacts(exp_id, {
            "targetMetrics": res["metrics"], "targetAnalysisAt": str(res["analysisTimestamp"]),
        })
        print("CANARY METRICS:")
        for m in res["metrics"]:
            v = m["variants"][0]
            print(f"  {m['label']}: C={m['control']['mean']:.3f}(n={m['control']['sampleSize']}) "
                  f"T1={v['mean']:.3f}(n={v['sampleSize']}) Δ={v['percentChange']:+.1f}%")

    elif stage == "weights":
        w = int(sys.argv[2]) if len(sys.argv) > 2 else 50
        res = req("POST", f"/abtest/{a['targetAbTestId']}/weights", {
            "controlWeight": 100 - w, "treatmentWeight": w,
            "variants": [
                {"name": "C", "weight": 100 - w,
                 "variantConfiguration": {"target": {"name": a["targetNameV1"]}}},
                {"name": "T1", "weight": w,
                 "variantConfiguration": {"target": {"name": a["targetNameV2"]}}},
            ],
        })
        put_artifacts(exp_id, {"weights": {"control": 100 - w, "treatment": w}})
        print(f"WEIGHTS shifted to {100 - w}/{w}: {res}")

    elif stage == "cleanup":
        ids = {
            "abTestIds": [x for x in [a.get("bundleAbTestId"), a.get("targetAbTestId")] if x],
            "onlineEvalIds": [x for x in [a.get("onlineEvalIdV1"), a.get("onlineEvalIdV2")] if x],
            "bundleIds": [x for x in [a.get("controlBundleId"), a.get("treatmentBundleId")] if x],
            "gatewayId": a.get("gatewayId"),
            "targetIds": [x for x in [a.get("targetIdV1"), a.get("targetIdV2")] if x],
        }
        print("cleanup ids:", json.dumps(ids))
        res = req("POST", "/cleanup", ids)
        put_artifacts(exp_id, {"cleanupResults": res["results"], "cleanedAt": time.time()}, stage="done")
        for r in res["results"]:
            mark = "✓" if r["status"] == "deleted" else "–"
            print(f"  {mark} {r['category']} {r['detail'][:80]}")
        print(f"CLEANUP {res['deleted']}/{res['total']} deleted")

    else:
        raise SystemExit(f"unknown stage {stage}")


if __name__ == "__main__":
    main()
