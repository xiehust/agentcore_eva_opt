import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Card, Badge, Button } from "../components/ui";
import { useJourney } from "../state/journey";
import { useLiveApi } from "../lib/useLiveApi";
import { StepHeader } from "./StepScaffold";
import { useLang } from "../i18n/lang";
import { CLEANUP_ITEMS } from "../sim/engine";
import { useTimers } from "../lib/useTimers";
import { JOURNEY_SUMMARY, EXTERNAL_LINKS } from "../data/routingComparison";

type ItemState = "pending" | "deleting" | "deleted" | "skipped";

/** Step 9 — animated teardown of all resources, then the closing summary. */
export function Step9Cleanup() {
  const { state, dispatch } = useJourney();
  const { t } = useLang();
  const { api, isLive, creds } = useLiveApi();
  const [states, setStates] = useState<Record<string, ItemState>>(() =>
    Object.fromEntries(CLEANUP_ITEMS.map((i) => [i.key, "pending"])),
  );
  const [done, setDone] = useState(state.status.cleanup === "done");
  const [liveErr, setLiveErr] = useState("");
  const busy = useRef(false);
  const timers = useTimers();

  // Live cleanup: call the backend with the ids created this run, then map the
  // per-category results onto the display list.
  const runLiveCleanup = async () => {
    if (busy.current) return;
    busy.current = true;
    setLiveErr("");
    CLEANUP_ITEMS.forEach((it) =>
      setStates((p) => ({ ...p, [it.key]: "deleting" })),
    );
    try {
      const resp = await api.cleanup({
        abTestIds: [
          state.artifacts.bundleAbTestId,
          state.artifacts.targetAbTestId,
        ].filter(Boolean),
        evaluatorIds: [state.artifacts.customEvaluatorId].filter(Boolean),
        bundleIds: [
          state.artifacts.baselineBundleId,
          state.artifacts.controlBundleId,
          state.artifacts.treatmentBundleId,
        ].filter(Boolean),
        gatewayId: state.artifacts.gatewayId,
        runtimeIds: [state.artifacts.agentId, state.artifacts.agentIdV2].filter(
          Boolean,
        ),
        roleName: state.artifacts.roleName,
        creds,
      });
      // Reflect real results: everything the backend touched → deleted/skipped.
      const anyDeleted = resp.results.some((r) => r.status === "deleted");
      CLEANUP_ITEMS.forEach((it) =>
        setStates((p) => ({
          ...p,
          [it.key]: anyDeleted ? "deleted" : "skipped",
        })),
      );
      setDone(true);
      dispatch({ type: "COMPLETE_STEP", step: "cleanup" });
    } catch (e) {
      setLiveErr(e instanceof Error ? e.message : String(e));
      CLEANUP_ITEMS.forEach((it) =>
        setStates((p) => ({ ...p, [it.key]: "skipped" })),
      );
    } finally {
      busy.current = false;
    }
  };

  const runCleanup = () => {
    if (busy.current) return;
    busy.current = true;
    let i = 0;
    const tick = () => {
      if (i >= CLEANUP_ITEMS.length) {
        busy.current = false;
        setDone(true);
        dispatch({ type: "COMPLETE_STEP", step: "cleanup" });
        return;
      }
      const key = CLEANUP_ITEMS[i].key;
      setStates((p) => ({ ...p, [key]: "deleting" }));
      timers.setTimeout(() => {
        setStates((p) => ({ ...p, [key]: "deleted" }));
        i += 1;
        timers.setTimeout(tick, 120);
      }, 320);
    };
    tick();
  };

  return (
    <div>
      <StepHeader index={9} title={t.steps.cleanup.title} lede={t.steps.cleanup.lede} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          eyebrow={t.step9.teardownEyebrow}
          title={t.step9.teardownTitle}
          accent="danger"
          action={
            done ? (
              <Badge variant="ok" dot>
                {t.step9.allDeleted}
              </Badge>
            ) : (
              <Badge variant="neutral" mono>
                {t.step9.categories(CLEANUP_ITEMS.length)}
              </Badge>
            )
          }
        >
          <Button
            variant="danger"
            onClick={isLive ? runLiveCleanup : runCleanup}
            disabled={busy.current || done}
          >
            {done ? t.step9.done : t.step9.runBtn}
          </Button>
          <ul className="mt-4 space-y-1.5" data-testid="cleanup-list">
            {CLEANUP_ITEMS.map((item) => {
              const st = states[item.key];
              return (
                <li
                  key={item.key}
                  className="flex items-center gap-3 rounded border border-line/60 bg-ink-900/40 px-3 py-2 text-sm"
                >
                  <span
                    className={
                      "grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs " +
                      (st === "deleted"
                        ? "bg-ok/15 text-ok"
                        : st === "skipped"
                          ? "bg-fog-600/20 text-fog-500"
                          : st === "deleting"
                            ? "bg-warn/15 text-warn animate-pulse-dot"
                            : "bg-ink-700 text-fog-600")
                    }
                  >
                    {st === "deleted"
                      ? "✓"
                      : st === "skipped"
                        ? "–"
                        : st === "deleting"
                          ? "•"
                          : "—"}
                  </span>
                  <span className="font-medium text-fog-200">
                    {t.step9.cleanupItems[item.key]?.label ?? item.label}
                  </span>
                  <span className="ml-auto truncate text-xs text-fog-600">
                    {t.step9.cleanupItems[item.key]?.detail ?? item.detail}
                  </span>
                </li>
              );
            })}
          </ul>
          {liveErr && (
            <div
              role="alert"
              className="mt-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
            >
              {liveErr}
            </div>
          )}
        </Card>

        {/* Summary */}
        <Card eyebrow={t.step9.recapEyebrow} title={t.step9.recapTitle} accent="orange">
          {done ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-line text-left text-fog-500">
                    <th className="py-1.5 pr-2 font-mono uppercase tracking-wider">{t.step9.colStep}</th>
                    <th className="py-1.5 pr-2 font-mono uppercase tracking-wider">{t.step9.colAction}</th>
                    <th className="py-1.5 font-mono uppercase tracking-wider">{t.step9.colApi}</th>
                  </tr>
                </thead>
                <tbody>
                  {JOURNEY_SUMMARY.map((r) => (
                    <tr key={r.step} className="border-b border-line/50 align-top">
                      <td className="py-1.5 pr-2 font-mono text-aws-orange-soft">{r.step}</td>
                      <td className="py-1.5 pr-2 text-fog-300">
                        {t.step9.summaryActions[r.step] ?? r.action}
                      </td>
                      <td className="py-1.5 font-mono text-fog-500">{r.api}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </motion.div>
          ) : (
            <p className="text-sm text-fog-500">
              {t.step9.recapEmpty}
            </p>
          )}
        </Card>
      </div>

      {/* Takeaways */}
      {done && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
          <Card eyebrow={t.step9.takeawaysEyebrow} title={t.step9.takeawaysTitle} accent="cyan">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {t.step9.takeaways.map((tk, i) => (
                <div
                  key={tk.title}
                  className="rounded-md border border-line bg-ink-750/60 p-3"
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className="font-mono text-xs text-cyan-soft">{i + 1}</span>
                    <span className="font-display text-sm font-semibold text-fog-100">
                      {tk.title}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-fog-400">{tk.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-3 border-t border-line/60 pt-4">
              {EXTERNAL_LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-mono text-xs text-cyan-soft underline-offset-4 hover:underline"
                >
                  ↗ {l.label}
                </a>
              ))}
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
