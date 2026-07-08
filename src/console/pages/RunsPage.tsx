import { useState } from "react";
import { Badge, Button, Card } from "../../components/ui";
import { LiveRunButton } from "../../components/LiveRunButton";
import { ScoreCard } from "../../components/ScoreCard";
import { useLiveApi } from "../../lib/useLiveApi";
import { useResource } from "../../lib/useResource";
import { useConsole } from "../../state/console";
import { useLang } from "../../i18n/lang";
import { BUILTIN_EVALUATORS, DEFAULT_EVALUATOR_IDS } from "../../data/evaluators";
import type { RunRecord, RunStatus } from "../../lib/liveApi";

const STATUS_VARIANT: Record<RunStatus, "neutral" | "warn" | "cyan" | "ok" | "danger"> = {
  pending: "neutral",
  invoking: "warn",
  waiting: "cyan",
  evaluating: "warn",
  completed: "ok",
  failed: "danger",
};

/** Runs: start a new evaluation run (agent + dataset + evaluators) and browse history. */
export function RunsPage() {
  const { api, creds } = useLiveApi();
  const { state } = useConsole();
  const { t } = useLang();
  const agents = useResource(() => api.listAgents(), []);
  const datasets = useResource(() => api.listDatasets(), []);
  const runs = useResource(() => api.listRuns(), []);
  const customEvaluators = useResource(() => api.listEvaluators(creds ?? null), []);

  // Evaluable = deployed (managed) OR registered by telemetry binding (external).
  const evaluableAgents = (agents.data?.agents ?? []).filter(
    (a) => a.deployment?.status === "deployed" || (a.kind === "external" && a.binding),
  );
  const [agentId, setAgentId] = useState<string>(state.runDraft?.agentId ?? "");
  const [datasetId, setDatasetId] = useState<string>(state.runDraft?.datasetId ?? "");
  const [scope, setScope] = useState<"dataset" | "lookback" | "sessions">("dataset");
  const [lookbackHours, setLookbackHours] = useState(24);
  const [sessionIdsText, setSessionIdsText] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(DEFAULT_EVALUATOR_IDS));
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const toggleEvaluator = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const effectiveAgentId = agentId || evaluableAgents[0]?.id || "";
  const selectedAgent = evaluableAgents.find((a) => a.id === effectiveAgentId);
  // Dataset (active) runs need an invoker: a deployed runtime, or (later) an
  // external agent with an invoke endpoint configured.
  const canRunDataset =
    selectedAgent?.deployment?.status === "deployed" ||
    (selectedAgent?.kind === "external" && Boolean(selectedAgent.binding?.invoke));
  const effectiveScope = scope === "dataset" && !canRunDataset ? "lookback" : scope;
  const effectiveDatasetId = datasetId || datasets.data?.datasets[0]?.id || "";
  const parsedSessionIds = sessionIdsText
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const scopeReady =
    effectiveScope === "dataset"
      ? effectiveDatasetId !== ""
      : effectiveScope === "lookback"
        ? lookbackHours >= 1 && lookbackHours <= 336
        : parsedSessionIds.length > 0;
  const canStart = effectiveAgentId !== "" && scopeReady && selected.size > 0;

  const selectCls =
    "w-full rounded-md border border-line bg-ink-900/60 px-3 py-2 text-sm text-fog-100 outline-none focus:border-cyan/60";

  const selectedRun =
    runs.data?.runs.find((r) => r.id === selectedRunId) ?? runs.data?.runs[0] ?? null;

  return (
    <div className="space-y-4">
      <Card eyebrow={t.console.runs.newRunEyebrow} title={t.console.runs.newRunTitle} accent="orange">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="eyebrow mb-1 block">{t.console.runs.pickAgent}</span>
              <select value={effectiveAgentId} onChange={(e) => setAgentId(e.target.value)} className={selectCls}>
                {evaluableAgents.length === 0 && <option value="">—</option>}
                {evaluableAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.kind === "external" ? ` (${t.console.agents.externalBadge})` : ""}
                  </option>
                ))}
              </select>
              {evaluableAgents.length === 0 && (
                <span className="mt-1 block text-[11px] text-warn">{t.console.runs.noEvaluableAgents}</span>
              )}
              <span className="mt-1 block text-[11px] text-fog-500">{t.console.runs.evaluableHint}</span>
            </label>
            <div className="block">
              <span className="eyebrow mb-1 block">{t.console.runs.scope}</span>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t.console.runs.scope}>
                {(
                  [
                    ["dataset", t.console.runs.scopeDataset, !canRunDataset],
                    ["lookback", t.console.runs.scopeLookback, false],
                    ["sessions", t.console.runs.scopeSessions, false],
                  ] as const
                ).map(([key, label, disabled]) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={effectiveScope === key}
                    disabled={disabled}
                    onClick={() => setScope(key)}
                    className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                      effectiveScope === key
                        ? "border-cyan/60 bg-cyan/10 text-cyan-soft"
                        : disabled
                          ? "cursor-not-allowed border-line bg-ink-900/40 text-fog-600"
                          : "border-line bg-ink-750/40 text-fog-300 hover:border-cyan/40"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {!canRunDataset && (
                <span className="mt-1 block text-[11px] text-fog-500">
                  {t.console.runs.scopeDatasetDisabled}
                </span>
              )}
            </div>
          </div>

          {effectiveScope === "dataset" && (
            <label className="block sm:w-1/2">
              <span className="eyebrow mb-1 block">{t.console.runs.pickDataset}</span>
              <select value={effectiveDatasetId} onChange={(e) => setDatasetId(e.target.value)} className={selectCls}>
                {(datasets.data?.datasets ?? []).length === 0 && <option value="">—</option>}
                {datasets.data?.datasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({t.console.datasets.itemCount(d.items.length)})
                  </option>
                ))}
              </select>
              {(datasets.data?.datasets ?? []).length === 0 && !datasets.loading && (
                <span className="mt-1 block text-[11px] text-warn">{t.console.runs.noDatasets}</span>
              )}
            </label>
          )}
          {effectiveScope === "lookback" && (
            <label className="block sm:w-1/3">
              <span className="eyebrow mb-1 block">{t.console.runs.lookbackLabel}</span>
              <input
                type="number"
                min={1}
                max={336}
                value={lookbackHours}
                onChange={(e) => setLookbackHours(Number(e.target.value))}
                className={selectCls}
                data-testid="lookback-hours"
              />
              <span className="mt-1 block text-[11px] text-fog-500">{t.console.runs.lookbackHint}</span>
            </label>
          )}
          {effectiveScope === "sessions" && (
            <label className="block">
              <span className="eyebrow mb-1 block">{t.console.runs.sessionIdsLabel}</span>
              <textarea
                value={sessionIdsText}
                onChange={(e) => setSessionIdsText(e.target.value)}
                rows={3}
                spellCheck={false}
                className={`${selectCls} font-mono text-xs`}
                data-testid="session-ids"
              />
              <span className="mt-1 block text-[11px] text-fog-500">{t.console.runs.sessionIdsHint}</span>
            </label>
          )}

          <div>
            <span className="eyebrow mb-2 block">{t.console.runs.pickEvaluators}</span>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {BUILTIN_EVALUATORS.map((ev) => (
                <label
                  key={ev.evaluatorId}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md border border-line bg-ink-750/40 px-3 py-2 text-sm text-fog-200 hover:border-cyan/40"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(ev.evaluatorId)}
                    onChange={() => toggleEvaluator(ev.evaluatorId)}
                    className="accent-aws-orange"
                  />
                  <span>{t.evaluators.labels[ev.evaluatorId] ?? ev.label}</span>
                  <Badge variant="neutral" mono className="ml-auto">
                    {ev.level}
                  </Badge>
                </label>
              ))}
              {customEvaluators.data?.evaluators
                .filter((ev) => !ev.evaluatorId.startsWith("Builtin."))
                .map((ev) => (
                <label
                  key={ev.evaluatorId}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md border border-line bg-ink-750/40 px-3 py-2 text-sm text-fog-200 hover:border-cyan/40"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(ev.evaluatorId)}
                    onChange={() => toggleEvaluator(ev.evaluatorId)}
                    className="accent-aws-orange"
                  />
                  <span>{ev.name}</span>
                  <Badge variant="orange" mono className="ml-auto">
                    custom
                  </Badge>
                </label>
              ))}
            </div>
          </div>

          <div>
            {!canStart && (
              <Button disabled>{t.console.runs.startBtn}</Button>
            )}
            {canStart && (
            <LiveRunButton
              label={t.console.runs.startBtn}
              doneLabel={t.console.runs.status.completed}
              run={async (onProgress) => {
                const { jobId, runId } = await api.createRun({
                  agentId: effectiveAgentId,
                  ...(effectiveScope === "dataset" && { datasetId: effectiveDatasetId }),
                  ...(effectiveScope === "lookback" && { lookbackHours }),
                  ...(effectiveScope === "sessions" && { sessionIds: parsedSessionIds }),
                  evaluators: Array.from(selected),
                  creds: creds ?? null,
                });
                setSelectedRunId(runId);
                runs.reload();
                const result = await api.pollJob(jobId, {
                  onProgress: (s) => s.progress && onProgress(s.progress),
                });
                runs.reload();
                return result;
              }}
            />
            )}
            <p className="mt-1.5 text-[11px] leading-relaxed text-fog-500">
              {effectiveScope === "dataset" ? t.console.runs.startedHint : t.console.runs.passiveStartedHint}
            </p>
          </div>
        </div>
      </Card>

      <Card eyebrow={t.console.runs.historyEyebrow} title={t.console.runs.historyTitle} accent="cyan"
        action={
          <Button size="sm" variant="ghost" onClick={runs.reload}>
            {t.console.common.refresh}
          </Button>
        }
      >
        {runs.loading && <p className="text-sm text-fog-500">{t.console.common.loading}</p>}
        {runs.error && <p className="text-sm text-danger">{runs.error}</p>}
        {runs.data && runs.data.runs.length === 0 && (
          <p className="text-sm text-fog-400">{t.console.runs.emptyHistory}</p>
        )}
        <ul className="space-y-2">
          {runs.data?.runs.map((run) => (
            <li key={run.id}>
              <button
                type="button"
                onClick={() => setSelectedRunId(run.id)}
                aria-current={selectedRun?.id === run.id ? "true" : undefined}
                className={`flex w-full flex-wrap items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${
                  selectedRun?.id === run.id
                    ? "border-cyan/50 bg-ink-700/70"
                    : "border-line bg-ink-750/40 hover:border-cyan/30"
                }`}
              >
                <span className="text-sm font-semibold text-fog-100">{run.agentName}</span>
                <span className="font-mono text-[11px] text-fog-500">× {runSourceLabel(run, t)}</span>
                <Badge
                  variant={STATUS_VARIANT[run.status]}
                  dot
                  pulse={run.status === "invoking" || run.status === "waiting" || run.status === "evaluating"}
                  mono
                >
                  {t.console.runs.status[run.status]}
                </Badge>
                <span className="ml-auto font-mono text-[11px] text-fog-500">
                  {new Date(run.createdAt * 1000).toLocaleString()}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {selectedRun && <RunDetail run={selectedRun} />}
      </Card>
    </div>
  );
}

/** "DS" (dataset name) | "Lookback 24h" | "5 sessions (explicit)". */
function runSourceLabel(run: RunRecord, t: ReturnType<typeof useLang>["t"]): string {
  const source = run.source ?? "dataset";
  if (source.startsWith("lookback:")) {
    return t.console.runs.sourceLookback(Number(source.slice("lookback:".length)) || 0);
  }
  if (source.startsWith("sessions:")) {
    return t.console.runs.sourceSessions(Number(source.slice("sessions:".length)) || 0);
  }
  return run.datasetName || "—";
}

function RunDetail({ run }: { run: RunRecord }) {
  const { t } = useLang();
  const { dispatch } = useConsole();
  return (
    <div className="mt-4 border-t border-line/60 pt-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1">
        <span className="eyebrow">{t.console.runs.scoresEyebrow}</span>
        {run.sessionIds && (
          <span className="font-mono text-[11px] text-fog-500">
            {t.console.runs.sessions(run.sessionIds.length)}
          </span>
        )}
        {run.batchEvaluationId && (
          <span className="font-mono text-[11px] text-fog-500">
            {t.console.runs.batchId}: {run.batchEvaluationId}
          </span>
        )}
        {(run.sessionIds?.length ?? 0) > 0 && (
          <span className="ml-auto">
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                dispatch({
                  type: "START_INSIGHTS_WITH",
                  agentId: run.agentId,
                  runId: run.id,
                })
              }
            >
              {t.console.runs.triageBtn}
            </Button>
          </span>
        )}
      </div>
      {run.error && (
        <div role="alert" className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {run.error}
        </div>
      )}
      {run.scores && run.scores.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {run.scores.map((s) => (
            <ScoreCard
              key={s.evaluatorId}
              label={t.evaluators.labels[s.evaluatorId] ?? s.evaluatorId}
              score={s.score}
            />
          ))}
        </div>
      ) : (
        !run.error && <p className="text-sm text-fog-400">{t.console.runs.selectRun}</p>
      )}
    </div>
  );
}
