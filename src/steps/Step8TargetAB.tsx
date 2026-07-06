import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Card, Stat, Badge, Button } from "../components/ui";
import { LazyABChart } from "../components/LazyABChart";
import { AsyncRunButton } from "../components/AsyncRunButton";
import { LiveRunButton } from "../components/LiveRunButton";
import { useJourney } from "../state/journey";
import { useLiveApi } from "../lib/useLiveApi";
import { StepHeader } from "./StepScaffold";
import { useLang } from "../i18n/lang";
import { deployStages, fakeArn } from "../sim/engine";
import { useTimers } from "../lib/useTimers";
import { TARGET_PROMPTS } from "../data/prompts";
import { TARGET_AB_RESULTS } from "../data/results";
import { V2_EXTRA_TOOL } from "../data/agent";
import type { ABMetric, SimStage } from "../sim/types";

const ROLLOUT_STEPS = [
  { weight: 10, key: "canary" as const },
  { weight: 50, key: "ramp" as const },
  { weight: 100, key: "full" as const },
];

const SETUP_STAGES: SimStage[] = [
  { key: "tgt", label: "Adding v2 gateway target", ms: 420, terminal: "READY" },
  { key: "eval", label: "Creating v2 online eval config", ms: 380 },
  { key: "stop", label: "Stopping config-bundle A/B test", ms: 360, terminal: "STOPPED" },
  { key: "ab", label: "Creating target A/B test (C 90% / T1 10%)", ms: 460, terminal: "RUNNING" },
];

/** Step 8 — target-based canary rollout of v2 across two runtimes. */
interface DeployJobResult {
  runtime_arn: string;
  log_group: string;
  service_name: string;
}

export function Step8TargetAB() {
  const { state, dispatch } = useJourney();
  const { t } = useLang();
  const { api, isLive, creds } = useLiveApi();
  const [v2Deployed, setV2Deployed] = useState(!!state.artifacts.agentArnV2);
  const [v2Arn, setV2Arn] = useState<string | undefined>(state.artifacts.agentArnV2);
  // A persisted target A/B test id means setup already completed (e.g. reload).
  const [setupDone, setSetupDone] = useState(!!state.artifacts.targetAbTestId);
  const [sent, setSent] = useState(
    state.artifacts.targetTrafficSent ? TARGET_PROMPTS.length : 0,
  );
  const [resultsReady, setResultsReady] = useState(false);
  const [rolloutIdx, setRolloutIdx] = useState(0);
  const [abMetrics, setAbMetrics] = useState<ABMetric[]>(TARGET_AB_RESULTS);
  const busy = useRef(false);
  const timers = useTimers();

  const v2Name = state.artifacts.v2Name ?? "HRAssistV2";

  const onV2Deploy = () => {
    const id = `${v2Name}`.toLowerCase();
    const arn = fakeArn("bedrock-agentcore", "runtime", id);
    setV2Arn(arn);
    setV2Deployed(true);
    dispatch({ type: "SET_ARTIFACT", artifacts: { agentArnV2: arn } });
  };

  // Live: real v2 deploy (code change — adds escalate tool + improved prompt).
  const runLiveV2Deploy = async (onProgress: (m: string) => void) => {
    const { jobId } = await api.deploy({ name: v2Name, version: "v2", creds });
    const job = await api.pollJob<DeployJobResult>(jobId, {
      onProgress: (s) => onProgress(s.progress ?? s.state),
    });
    setV2Arn(job.runtime_arn);
    setV2Deployed(true);
    dispatch({
      type: "SET_ARTIFACT",
      artifacts: {
        agentArnV2: job.runtime_arn,
        logGroupV2: job.log_group,
        serviceNameV2: job.service_name,
      },
    });
    return job;
  };

  // Live: add v2 target + v2 eval, stop the bundle test, create the target A/B.
  const runLiveSetup = async (onProgress: (m: string) => void) => {
    const suffix = state.artifacts.suffix ?? "";
    const { jobId } = await api.abtestTargetSetup({
      name: `HRTargetAB${suffix}`,
      gatewayId: (state.artifacts.gatewayId as string) ?? "",
      gatewayArn: (state.artifacts.gatewayArn as string) ?? "",
      roleArn: (state.artifacts.roleArn as string) ?? "",
      agentArnV2: state.artifacts.agentArnV2 ?? v2Arn ?? "",
      targetNameV1: "HRAgentV1",
      targetNameV2: "HRAgentV2",
      onlineEvalNameV2: `HROnlineEvalV2${suffix}`,
      logGroupV2: (state.artifacts.logGroupV2 as string) ?? "",
      serviceNameV2: (state.artifacts.serviceNameV2 as string) ?? "",
      onlineEvalArnV1: (state.artifacts.onlineEvalArnV1 as string) ?? "",
      bundleAbTestId: (state.artifacts.bundleAbTestId as string) ?? undefined,
      creds,
    });
    const res = await api.pollJob<{ abTestId: string }>(jobId, {
      onProgress: (s) => onProgress(s.progress ?? s.state),
    });
    dispatch({
      type: "SET_ARTIFACT",
      artifacts: { targetAbTestId: res.abTestId },
    });
    setSetupDone(true);
    return res;
  };

  const sendTrafficLive = async () => {
    if (busy.current || !setupDone) return;
    busy.current = true;
    setSent(0);
    try {
      // Send through the v2 target URL — the target A/B test's routing rule
      // splits traffic across v1/v2 by weight regardless of entry target.
      const { jobId } = await api.gatewayTraffic({
        gatewayId: (state.artifacts.gatewayId as string) ?? "",
        targetName: "HRAgentV2",
        prompts: TARGET_PROMPTS.map((p) => ({ prompt: p })),
        creds,
      });
      const job = await api.pollJob<{ count: number }>(jobId, {
        onProgress: (s) => {
          const m = /sent (\d+)\//.exec(s.progress ?? "");
          if (m) setSent(Number(m[1]));
        },
      });
      setSent(job.count ?? TARGET_PROMPTS.length);
      dispatch({ type: "SET_ARTIFACT", artifacts: { targetTrafficSent: true } });
    } catch {
      setSent(0);
    } finally {
      busy.current = false;
    }
  };

  const sendTraffic = () => {
    if (busy.current || !setupDone) return;
    busy.current = true;
    setSent(0);
    let i = 0;
    const tick = () => {
      i += 1;
      setSent(i);
      if (i >= TARGET_PROMPTS.length) {
        busy.current = false;
        return;
      }
      timers.setTimeout(tick, 160);
    };
    tick();
  };

  // Live: poll get_ab_test until aggregation completes (~10–15 min), like step 7.
  const runLiveMonitor = async (onProgress: (m: string) => void) => {
    const id = state.artifacts.targetAbTestId as string | undefined;
    if (!id) throw new Error("No target A/B test id — run setup first");
    const started = Date.now();
    for (;;) {
      onProgress("polling canary results (aggregation takes ~10–15 min)");
      const res = await api.getAbTest(id);
      const m = (res.metrics as ABMetric[]) ?? [];
      if (res.analysisTimestamp && m.length) {
        setAbMetrics(m);
        setResultsReady(true);
        return res;
      }
      if (Date.now() - started > 25 * 60_000) {
        throw new Error("Canary results not ready after 25 min — try again later");
      }
      onProgress(
        `waiting for aggregation… (${Math.round((Date.now() - started) / 1000)}s)`,
      );
      await new Promise((r) => setTimeout(r, 30_000));
    }
  };

  const advanceRollout = () => {
    const next = rolloutIdx + 1;
    setRolloutIdx(next);
    dispatch({
      type: "SET_ARTIFACT",
      artifacts: { rolloutWeight: ROLLOUT_STEPS[next]?.weight ?? 100 },
    });
    if (next >= ROLLOUT_STEPS.length - 1) {
      dispatch({ type: "COMPLETE_STEP", step: "targetAB" });
    }
  };

  const current = ROLLOUT_STEPS[rolloutIdx];

  return (
    <div>
      <StepHeader index={9} title={t.steps.targetAB.title} lede={t.steps.targetAB.lede} />

      <div className="space-y-6">
        {/* Routing comparison table */}
        <Card eyebrow={t.step8.comparisonEyebrow} title={t.step8.comparisonTitle} accent="none">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="py-2 pr-4 font-mono text-xs uppercase tracking-wider text-fog-500"></th>
                  <th className="py-2 pr-4 font-semibold text-cyan-soft">{t.step8.configBundleCol}</th>
                  <th className="py-2 font-semibold text-aws-orange-soft">{t.step8.targetBasedCol}</th>
                </tr>
              </thead>
              <tbody>
                {t.step8.routingRows.map((r) => (
                  <tr key={r.dimension} className="border-b border-line/50">
                    <td className="py-2 pr-4 font-medium text-fog-200">{r.dimension}</td>
                    <td className="py-2 pr-4 text-fog-400">{r.configBundle}</td>
                    <td className="py-2 text-fog-400">{r.targetBased}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* v2 deploy */}
          <Card eyebrow={t.step8.deployEyebrow} title={t.step8.deployTitle} accent="orange">
            {!v2Deployed ? (
              isLive ? (
                <LiveRunButton
                  label={t.step8.deployBtnLive}
                  doneLabel={t.step8.deployed}
                  run={runLiveV2Deploy}
                />
              ) : (
                <AsyncRunButton
                  label={t.step8.deployBtn}
                  doneLabel={t.step8.deployed}
                  stages={deployStages("v2")}
                  onComplete={onV2Deploy}
                />
              )
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                <Stat label={t.step8.v2Arn} value={v2Arn} mono truncate />
                <div className="rounded-md border border-cyan/30 bg-cyan/[0.06] px-3 py-2">
                  <p className="text-xs text-fog-300">
                    <span className="font-mono text-cyan-soft">
                      {t.step8.v2ToolNote(V2_EXTRA_TOOL.name)}
                    </span>
                  </p>
                </div>
              </motion.div>
            )}
          </Card>

          {/* setup + traffic */}
          <Card eyebrow={t.step8.canaryEyebrow} title={t.step8.canaryTitle} accent="cyan">
            {isLive ? (
              <LiveRunButton
                label={t.step8.setupBtnLive}
                doneLabel={t.step8.canaryLive}
                run={runLiveSetup}
              />
            ) : (
              <AsyncRunButton
                label={t.step8.setupBtn}
                doneLabel={t.step8.canaryLive}
                stages={SETUP_STAGES}
                onComplete={() => setSetupDone(true)}
              />
            )}
            <div className="mt-4">
              <Button
                variant="secondary"
                onClick={isLive ? sendTrafficLive : sendTraffic}
                disabled={!setupDone || sent > 0}
              >
                {sent === TARGET_PROMPTS.length
                  ? t.common.sent
                  : sent > 0
                    ? t.common.sending
                    : isLive
                      ? t.step8.sendBtnLive(TARGET_PROMPTS.length)
                      : t.step8.sendBtn(TARGET_PROMPTS.length)}
              </Button>
              <Badge variant={sent === TARGET_PROMPTS.length ? "ok" : "neutral"} mono className="ml-3">
                {sent}/{TARGET_PROMPTS.length}
              </Badge>
            </div>
          </Card>
        </div>

        {/* Results */}
        {sent === TARGET_PROMPTS.length && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card eyebrow={t.step8.resultsEyebrow} title={t.step8.resultsTitle} accent="cyan">
              {!resultsReady ? (
                isLive ? (
                  <LiveRunButton
                    label={t.step8.monitorBtnLive}
                    doneLabel={t.step8.resultsReady}
                    run={runLiveMonitor}
                  />
                ) : (
                  <AsyncRunButton
                    label={t.step8.monitorBtn}
                    doneLabel={t.step8.resultsReady}
                    stages={[
                      { key: "to", label: "Waiting for session timeout", ms: 600 },
                      { key: "ev", label: "Per-variant evaluators scoring", ms: 700 },
                      { key: "agg", label: "Aggregating means", ms: 600, terminal: "DONE" },
                    ]}
                    onComplete={() => setResultsReady(true)}
                  />
                )
              ) : (
                <LazyABChart
                  metrics={abMetrics}
                  controlLabel={t.step8.v1Label}
                  treatmentLabel={t.step8.v2Label}
                />
              )}
            </Card>
          </motion.div>
        )}

        {/* Rollout */}
        {resultsReady && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card eyebrow={t.step8.rolloutEyebrow} title={t.step8.rolloutTitle} accent="orange">
              <div className="mb-4 flex items-center gap-2">
                {ROLLOUT_STEPS.map((s, i) => (
                  <div key={s.weight} className="flex items-center gap-2">
                    <span
                      className={
                        "rounded-full border px-3 py-1 font-mono text-xs " +
                        (i <= rolloutIdx
                          ? "border-aws-orange bg-aws-orange/15 text-aws-orange-soft"
                          : "border-line-bright text-fog-500")
                      }
                    >
                      {t.step8.rollout[s.key]} · {s.weight}%
                    </span>
                    {i < ROLLOUT_STEPS.length - 1 && (
                      <span className="text-fog-600">→</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Weight bar */}
              <div className="mb-2 flex h-3 overflow-hidden rounded-full border border-line">
                <div
                  className="bg-fog-600 transition-all duration-500"
                  style={{ width: `${100 - current.weight}%` }}
                />
                <div
                  className="bg-aws-orange transition-all duration-500"
                  style={{ width: `${current.weight}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-fog-300">
                  <span className="font-semibold text-fog-100">
                    {t.step8.rollout[current.key]}:
                  </span>{" "}
                  {t.step8.rolloutNotes[current.key]}
                </p>
                {rolloutIdx < ROLLOUT_STEPS.length - 1 ? (
                  <Button onClick={advanceRollout}>
                    {t.step8.rampBtn(ROLLOUT_STEPS[rolloutIdx + 1].weight)}
                  </Button>
                ) : (
                  <Badge variant="ok" dot>
                    {t.step8.fullyRolledOut}
                  </Badge>
                )}
              </div>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}
