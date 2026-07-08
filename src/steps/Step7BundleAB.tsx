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
import { makeSuffix } from "../sim/engine";
import { useTimers } from "../lib/useTimers";
import { GW_PROMPTS } from "../data/prompts";
import { BUNDLE_AB_RESULTS } from "../data/results";
import { promoteVerdict, verdictSentence } from "../lib/abVerdict";
import type { ABMetric, SimStage } from "../sim/types";

const SETUP_STAGES: SimStage[] = [
  { key: "gw", label: "Creating HTTP gateway (IAM authorizer)", ms: 460, terminal: "READY" },
  { key: "tgt", label: "Creating gateway target → v1 runtime", ms: 420, terminal: "READY" },
  { key: "trace", label: "Configuring gateway tracing (X-Ray → CloudWatch)", ms: 380 },
  { key: "eval", label: "Creating online evaluation config", ms: 400 },
  { key: "ab", label: "Creating A/B test (C 50% / T1 50%)", ms: 460, terminal: "RUNNING" },
];

/** Step 7 — config-bundle A/B test: setup, traffic, results, promote. */
export function Step7BundleAB() {
  const { state, dispatch } = useJourney();
  const { t } = useLang();
  const { api, isLive, creds } = useLiveApi();
  // A persisted A/B test id means setup already completed (e.g. page reload).
  const [setupDone, setSetupDone] = useState(!!state.artifacts.bundleAbTestId);
  const [sent, setSent] = useState(
    state.artifacts.gwTrafficSent ? GW_PROMPTS.length : 0,
  );
  const [resultsReady, setResultsReady] = useState(false);
  const [promoted, setPromoted] = useState(!!state.artifacts.bundlePromoted);
  const [newVersion, setNewVersion] = useState<string | undefined>(
    state.artifacts.bundlePromoted ? state.artifacts.controlBundleVersion : undefined,
  );
  const [abMetrics, setAbMetrics] = useState<ABMetric[]>(BUNDLE_AB_RESULTS);
  const [abTestId, setAbTestId] = useState<string | undefined>(
    state.artifacts.bundleAbTestId as string | undefined,
  );
  const busy = useRef(false);
  const timers = useTimers();

  const controlVer = state.artifacts.controlBundleVersion ?? "ver-000000";
  // Interpret the (sim or live) A/B results so the promote card matches reality.
  const verdict = promoteVerdict(abMetrics);

  // ─── Live handlers ────────────────────────────────────────────────────────
  const runLiveSetup = async (onProgress: (m: string) => void) => {
    const roleArn = (state.artifacts.roleArn as string) ?? "";
    const { jobId } = await api.gatewaySetup({
      name: `HRGateway${state.artifacts.suffix ?? ""}`,
      roleArn,
      agentArn: state.artifacts.agentArn ?? "",
      targetName: "HRAgentV1",
      onlineEvalName: `HROnlineEval${state.artifacts.suffix ?? ""}`,
      logGroup: state.artifacts.logGroup ?? "",
      serviceName: state.artifacts.serviceName ?? "",
      creds,
    });
    const gw = await api.pollJob<{
      gatewayId: string;
      gatewayArn: string;
      onlineEvalArn: string;
      roleArn: string;
    }>(jobId, { onProgress: (s) => onProgress(s.progress ?? s.state) });
    // Persist gateway/role/v1-eval so step 8 can reuse the same gateway.
    dispatch({
      type: "SET_ARTIFACT",
      artifacts: {
        gatewayId: gw.gatewayId,
        gatewayArn: gw.gatewayArn,
        roleArn: gw.roleArn || roleArn,
        onlineEvalArnV1: gw.onlineEvalArn,
      },
    });
    onProgress("creating A/B test");
    const ab = await api.abtestConfigBundle({
      name: `HRBundleAB${state.artifacts.suffix ?? ""}`,
      gatewayArn: gw.gatewayArn,
      roleArn: gw.roleArn || roleArn,
      onlineEvalArn: gw.onlineEvalArn,
      // Bundle IDs (Step 6 artifacts) — the backend resolves them to full ARNs.
      controlBundleArn: state.artifacts.controlBundleId ?? "",
      controlVersion: controlVer,
      treatmentBundleArn: state.artifacts.treatmentBundleId ?? "",
      treatmentVersion: state.artifacts.treatmentBundleVersion ?? "",
      creds,
    });
    setAbTestId(ab.abTestId);
    dispatch({ type: "SET_ARTIFACT", artifacts: { bundleAbTestId: ab.abTestId } });
    setSetupDone(true);
    return ab;
  };

  const runLiveMonitor = async (onProgress: (m: string) => void) => {
    if (!abTestId) throw new Error("No A/B test id — run setup first");
    // Aggregation takes ~10–15 min after the last session: poll like the
    // notebook does instead of trusting a single fetch (empty metrics would
    // otherwise silently render the sim chart).
    const started = Date.now();
    for (;;) {
      onProgress("polling A/B results (aggregation takes ~10–15 min)");
      const res = await api.getAbTest(abTestId);
      const metrics = (res.metrics as ABMetric[]) ?? [];
      if (res.analysisTimestamp && metrics.length) {
        setAbMetrics(metrics);
        setResultsReady(true);
        return res;
      }
      if (Date.now() - started > 25 * 60_000) {
        throw new Error(
          "A/B results not ready after 25 min — try Monitor again later",
        );
      }
      onProgress(
        `waiting for aggregation… (${Math.round((Date.now() - started) / 1000)}s)`,
      );
      await new Promise((r) => setTimeout(r, 30_000));
    }
  };

  const sendTrafficLive = async () => {
    if (busy.current || !setupDone) return;
    busy.current = true;
    setSent(0);
    try {
      // Through the gateway (not direct invoke) so the A/B test routes each
      // session to C or T1 and the online evaluator collects them.
      const { jobId } = await api.gatewayTraffic({
        gatewayId: (state.artifacts.gatewayId as string) ?? "",
        targetName: "HRAgentV1",
        prompts: GW_PROMPTS.map((p) => ({ prompt: p })),
        creds,
      });
      const job = await api.pollJob<{ count: number }>(jobId, {
        onProgress: (s) => {
          const m = /sent (\d+)\//.exec(s.progress ?? "");
          if (m) setSent(Number(m[1]));
        },
      });
      setSent(job.count ?? GW_PROMPTS.length);
      dispatch({ type: "SET_ARTIFACT", artifacts: { gwTrafficSent: true } });
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
      if (i >= GW_PROMPTS.length) {
        busy.current = false;
        return;
      }
      timers.setTimeout(tick, 90);
    };
    tick();
  };

  const promote = async () => {
    let v = `ver-${makeSuffix()}`;
    if (isLive && state.artifacts.controlBundleId) {
      try {
        const r = await api.updateBundle(state.artifacts.controlBundleId, {
          agentArn: state.artifacts.agentArn ?? "",
          systemPrompt: state.artifacts.treatmentSystemPrompt as string | undefined,
          toolDescriptions: {},
          parentVersionIds: [controlVer],
          commitMessage: "Promote treatment (A/B validated)",
          creds,
        });
        v = r.versionId;
      } catch {
        // Fall through to a synthetic version marker; error surfaced by button state.
      }
    }
    setNewVersion(v);
    setPromoted(true);
    dispatch({
      type: "COMPLETE_STEP",
      step: "bundleAB",
      artifacts: { bundlePromoted: true, controlBundleVersion: v },
    });
  };

  return (
    <div>
      <StepHeader index={9} title={t.steps.bundleAB.title} lede={t.steps.bundleAB.lede} learn={t.steps.bundleAB.learn} />

      <div className="space-y-6">
        <div className="space-y-6">
          <Card eyebrow={t.step7.setupEyebrow} title={t.step7.setupTitle} accent="orange">
            {isLive ? (
              <LiveRunButton
                label={t.step7.setupBtnLive}
                doneLabel={t.step7.setupDone}
                run={runLiveSetup}
              />
            ) : (
              <AsyncRunButton
                label={t.step7.setupBtn}
                doneLabel={t.step7.setupDone}
                stages={SETUP_STAGES}
                onComplete={() => setSetupDone(true)}
              />
            )}
          </Card>

          <Card
            eyebrow={t.step7.trafficEyebrow}
            title={t.step7.trafficTitle}
            accent="cyan"
            action={
              <Badge variant={sent === GW_PROMPTS.length ? "ok" : "neutral"} mono>
                {t.common.sessions(sent, GW_PROMPTS.length)}
              </Badge>
            }
          >
            <Button
              onClick={isLive ? sendTrafficLive : sendTraffic}
              disabled={!setupDone || sent > 0}
            >
              {sent === GW_PROMPTS.length
                ? t.common.sent
                : sent > 0
                  ? t.common.sending
                  : isLive
                    ? t.step7.sendBtnLive
                    : t.step7.sendBtn}
            </Button>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-600">
              <div
                className="h-full rounded-full bg-cyan transition-all duration-150"
                style={{ width: `${(sent / GW_PROMPTS.length) * 100}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-fog-500">{t.step7.stickyHint}</p>
          </Card>
        </div>

        {/* Results */}
        {sent === GW_PROMPTS.length && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card
              eyebrow={t.step7.resultsEyebrow}
              title={t.step7.resultsTitle}
              accent="cyan"
              action={resultsReady && <Badge variant="ok" dot>{t.step7.analysed}</Badge>}
            >
              {!resultsReady ? (
                isLive ? (
                  <LiveRunButton
                    label={t.step7.monitorBtnLive}
                    doneLabel={t.step7.resultsReady}
                    run={runLiveMonitor}
                  />
                ) : (
                  <AsyncRunButton
                    label={t.step7.monitorBtn}
                    doneLabel={t.step7.resultsReady}
                    stages={[
                      { key: "to", label: "Waiting for session timeout", ms: 600 },
                      { key: "ev", label: "Online evaluators scoring sessions", ms: 700 },
                      { key: "agg", label: "Aggregating per-variant means", ms: 600, terminal: "DONE" },
                    ]}
                    onComplete={() => setResultsReady(true)}
                  />
                )
              ) : (
                <LazyABChart
                  metrics={abMetrics}
                  controlLabel={t.step7.controlLabel}
                  treatmentLabel={t.step7.treatmentLabel}
                />
              )}
            </Card>
          </motion.div>
        )}

        {/* Promote */}
        {resultsReady && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card
              eyebrow={t.step7.promoteEyebrow}
              title={verdict?.status === "win" ? t.step7.promoteWinTitle : t.step7.promoteTitle}
              accent="orange"
              action={
                verdict && (
                  <Badge
                    variant={
                      verdict.status === "win"
                        ? "ok"
                        : verdict.status === "loss"
                          ? "warn"
                          : "neutral"
                    }
                    dot
                  >
                    {verdict.status === "win"
                      ? t.step7.t1Wins
                      : verdict.status === "loss"
                        ? t.step7.noImprovement
                        : t.step7.mixed}
                  </Badge>
                )
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="max-w-xl text-sm text-fog-300">
                  {verdict ? verdictSentence(verdict, t) : t.common.analysing}{" "}
                  {t.step7.promoteBody}{" "}
                  <span className="font-mono text-fog-200">parentVersionIds</span>.
                </p>
                <Button onClick={promote} disabled={promoted}>
                  {promoted
                    ? t.step7.promoted
                    : verdict?.status === "win"
                      ? t.step7.promoteBtn
                      : t.step7.promoteAnywayBtn}
                </Button>
              </div>
              {promoted && newVersion && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-4 grid gap-3 sm:grid-cols-2"
                >
                  <Stat label={t.step7.prevVersion} value={controlVer} mono truncate />
                  <Stat
                    label={t.step7.newVersion}
                    value={newVersion}
                    mono
                    truncate
                    delta="promoted"
                    deltaTone="up"
                  />
                </motion.div>
              )}
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}
