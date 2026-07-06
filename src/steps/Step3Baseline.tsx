import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Card, Stat, Badge, Button } from "../components/ui";
import { useJourney } from "../state/journey";
import { useLiveApi } from "../lib/useLiveApi";
import { StepHeader } from "./StepScaffold";
import { useLang } from "../i18n/lang";
import { BASELINE_PROMPTS } from "../data/prompts";
import { CURRENT_SYSTEM_PROMPT, CURRENT_TOOL_DESCRIPTIONS } from "../data/agent";
import { makeSuffix, fakeArn } from "../sim/engine";
import { useTimers } from "../lib/useTimers";
import type { SessionLogEntry } from "../sim/types";

type Phase = "idle" | "creating" | "bundle-ready" | "sending" | "ingest" | "done";

/** Step 3 — create the baseline config bundle, then stream 10 HR sessions. */
export function Step3Baseline() {
  const { state, dispatch } = useJourney();
  const { t } = useLang();
  const { api, isLive, creds } = useLiveApi();
  const [liveErr, setLiveErr] = useState<string>("");

  // Phase reflects how far the persisted run got: traffic sent → done;
  // bundle created but no traffic yet → bundle-ready (send stays enabled).
  const [phase, setPhase] = useState<Phase>(
    state.artifacts.baselineSessionIds
      ? "done"
      : state.artifacts.baselineBundleId
        ? "bundle-ready"
        : "idle",
  );
  const [bundleId, setBundleId] = useState<string | undefined>(
    state.artifacts.baselineBundleId,
  );
  const [bundleVersion, setBundleVersion] = useState<string | undefined>(
    state.artifacts.baselineBundleVersion,
  );
  // Rehydrate the session log from persisted artifacts — COMPLETE_STEP
  // navigates to Step 4, so returning here remounts the component.
  const [log, setLog] = useState<SessionLogEntry[]>(() => {
    const saved = state.artifacts.baselineSessionIds;
    if (!saved) return [];
    return saved.split(",").map((sid, i) => ({
      sessionId: sid,
      employeeId: BASELINE_PROMPTS[i]?.[0] ?? "",
      prompt: BASELINE_PROMPTS[i]?.[1] ?? "",
    }));
  });
  const [ingestLeft, setIngestLeft] = useState(0);
  const busy = useRef(false);
  const timers = useTimers();

  const createBundle = () => {
    if (busy.current) return;
    busy.current = true;
    setPhase("creating");
    timers.setTimeout(() => {
      const bId = `bndl-${makeSuffix()}`;
      const vId = `ver-${makeSuffix()}`;
      setBundleId(bId);
      setBundleVersion(vId);
      setPhase("bundle-ready");
      busy.current = false;
      dispatch({
        type: "SET_ARTIFACT",
        artifacts: { baselineBundleId: bId, baselineBundleVersion: vId },
      });
    }, 500);
  };

  const sendTraffic = () => {
    if (busy.current) return;
    busy.current = true;
    setPhase("sending");
    setLog([]);

    const ids: string[] = [];
    let i = 0;
    const tick = () => {
      if (i >= BASELINE_PROMPTS.length) {
        // Simulated CloudWatch ingestion countdown.
        setPhase("ingest");
        let left = 3;
        setIngestLeft(left);
        const countdown = timers.setInterval(() => {
          left -= 1;
          setIngestLeft(left);
          if (left <= 0) {
            timers.clearInterval(countdown);
            setPhase("done");
            busy.current = false;
            dispatch({
              type: "COMPLETE_STEP",
              step: "baseline",
              artifacts: { baselineSessionIds: ids.join(",") },
            });
          }
        }, 450);
        return;
      }
      const [emp, prompt] = BASELINE_PROMPTS[i];
      const sid = makeSuffix();
      ids.push(sid);
      setLog((prev) => [...prev, { sessionId: sid, employeeId: emp, prompt }]);
      i += 1;
      timers.setTimeout(tick, 260);
    };
    tick();
  };

  const baselineArn = bundleId
    ? fakeArn("bedrock-agentcore", "configuration-bundle", bundleId)
    : undefined;

  // ─── Live handlers (real backend) ─────────────────────────────────────────
  const createBundleLive = async () => {
    if (busy.current) return;
    busy.current = true;
    setPhase("creating");
    setLiveErr("");
    try {
      const resp = await api.createBundle({
        agentArn: state.artifacts.agentArn ?? "",
        name: `HRBaseline${state.artifacts.suffix ?? ""}`,
        systemPrompt: CURRENT_SYSTEM_PROMPT,
        toolDescriptions: CURRENT_TOOL_DESCRIPTIONS,
        commitMessage: "Initial configuration — baseline",
        creds,
      });
      setBundleId(resp.bundleId);
      setBundleVersion(resp.versionId);
      setPhase("bundle-ready");
      dispatch({
        type: "SET_ARTIFACT",
        artifacts: {
          baselineBundleId: resp.bundleId,
          baselineBundleVersion: resp.versionId,
        },
      });
    } catch (e) {
      setLiveErr(e instanceof Error ? e.message : String(e));
      setPhase("idle");
    } finally {
      busy.current = false;
    }
  };

  const sendTrafficLive = async () => {
    if (busy.current) return;
    busy.current = true;
    setPhase("sending");
    setLog([]);
    setLiveErr("");
    try {
      const { jobId } = await api.traffic({
        agentArn: state.artifacts.agentArn ?? "",
        prompts: BASELINE_PROMPTS.map(([employeeId, prompt]) => ({
          employeeId,
          prompt,
        })),
        bundleArn: baselineArn,
        bundleVersion,
        creds,
      });
      // Stream entries into the log as the backend reports "sent N/10", so
      // the user sees progress live instead of an empty list until the end.
      const job = await api.pollJob<{ sessionIds: string[] }>(jobId, {
        onProgress: (s) => {
          const m = /sent (\d+)\//.exec(s.progress ?? "");
          if (!m) return;
          const n = Number(m[1]);
          setLog(
            BASELINE_PROMPTS.slice(0, n).map(([emp, prompt]) => ({
              sessionId: "……",
              employeeId: emp,
              prompt,
            })),
          );
        },
      });
      const ids = (job.sessionIds ?? []).map((sid) => sid.slice(0, 8));
      setLog(
        ids.map((sid, i) => ({
          sessionId: sid,
          employeeId: BASELINE_PROMPTS[i]?.[0] ?? "",
          prompt: BASELINE_PROMPTS[i]?.[1] ?? "",
        })),
      );
      setPhase("done");
      dispatch({
        type: "COMPLETE_STEP",
        step: "baseline",
        artifacts: { baselineSessionIds: ids.join(",") },
      });
    } catch (e) {
      setLiveErr(e instanceof Error ? e.message : String(e));
      setPhase("bundle-ready");
    } finally {
      busy.current = false;
    }
  };

  return (
    <div>
      <StepHeader index={3} title={t.steps.baseline.title} lede={t.steps.baseline.lede} />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Bundle creation + traffic controls */}
        <div className="space-y-6 lg:col-span-2">
          <Card eyebrow={t.step3.bundleEyebrow} title={t.step3.bundleTitle} accent="orange">
            <Button
              onClick={isLive ? createBundleLive : createBundle}
              disabled={phase !== "idle"}
            >
              {phase === "idle"
                ? isLive
                  ? t.step3.createBtnLive
                  : t.step3.createBtn
                : phase === "creating"
                  ? t.common.creating
                  : t.common.created}
            </Button>
            {liveErr && (
              <div
                role="alert"
                className="mt-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
              >
                {liveErr}
              </div>
            )}
            {bundleId && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 space-y-3"
              >
                <Stat label={t.step3.bundleId} value={bundleId} mono truncate />
                <Stat label={t.step3.version} value={bundleVersion} mono truncate />
                <Stat label={t.step3.bundleArn} value={baselineArn} mono truncate />
                <p className="text-xs text-fog-500">
                  commit: <span className="font-mono">Initial configuration — baseline</span>
                </p>
              </motion.div>
            )}
          </Card>

          <Card eyebrow={t.step3.trafficEyebrow} title={t.step3.trafficTitle} accent="cyan">
            <Button
              onClick={isLive ? sendTrafficLive : sendTraffic}
              disabled={
                phase === "idle" ||
                phase === "creating" ||
                phase === "sending" ||
                phase === "ingest" ||
                phase === "done"
              }
            >
              {phase === "done"
                ? t.common.sent
                : phase === "sending"
                  ? t.common.sending
                  : isLive
                    ? t.step3.sendBtnLive
                    : t.step3.sendBtn}
            </Button>
            {phase === "ingest" && (
              <p className="mt-3 font-mono text-xs text-aws-orange-soft">
                {t.step3.waitingIngest(ingestLeft)}
              </p>
            )}
            {phase === "done" && (
              <Badge variant="ok" dot className="mt-3">
                {t.step3.ingested}
              </Badge>
            )}
          </Card>
        </div>

        {/* Live session log */}
        <Card
          eyebrow={t.step3.logEyebrow}
          title={t.step3.logTitle}
          accent="none"
          className="lg:col-span-3"
          action={
            <Badge variant={log.length === 10 ? "ok" : "neutral"} mono>
              {t.common.sessions(log.length, 10)}
            </Badge>
          }
        >
          {log.length === 0 ? (
            <p className="text-sm text-fog-500">
              {t.step3.logEmpty}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {log.map((e, idx) => (
                <motion.li
                  key={e.sessionId + idx}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-start gap-3 rounded border border-line/60 bg-ink-900/50 px-3 py-2 font-mono text-xs"
                >
                  <span className="text-fog-600">{String(idx + 1).padStart(2, "0")}</span>
                  <span className="text-cyan-soft">{e.sessionId}</span>
                  <span className="text-aws-orange-soft">{e.employeeId}</span>
                  <span className="min-w-0 flex-1 truncate text-fog-300" title={e.prompt}>
                    {e.prompt}
                  </span>
                </motion.li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
