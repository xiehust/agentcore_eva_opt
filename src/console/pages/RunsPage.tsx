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

  const deployedAgents = (agents.data?.agents ?? []).filter(
    (a) => a.deployment?.status === "deployed",
  );
  const [agentId, setAgentId] = useState<string>(state.runDraft?.agentId ?? "");
  const [datasetId, setDatasetId] = useState<string>(state.runDraft?.datasetId ?? "");
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

  const effectiveAgentId = agentId || deployedAgents[0]?.id || "";
  const effectiveDatasetId = datasetId || datasets.data?.datasets[0]?.id || "";
  const canStart = effectiveAgentId !== "" && effectiveDatasetId !== "" && selected.size > 0;

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
                {deployedAgents.length === 0 && <option value="">—</option>}
                {deployedAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              {deployedAgents.length === 0 && (
                <span className="mt-1 block text-[11px] text-warn">{t.console.runs.noDeployedAgents}</span>
              )}
              <span className="mt-1 block text-[11px] text-fog-500">{t.console.runs.onlyDeployedHint}</span>
            </label>
            <label className="block">
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
          </div>

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
                  datasetId: effectiveDatasetId,
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
            <p className="mt-1.5 text-[11px] leading-relaxed text-fog-500">{t.console.runs.startedHint}</p>
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
                <span className="font-mono text-[11px] text-fog-500">× {run.datasetName}</span>
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

function RunDetail({ run }: { run: RunRecord }) {
  const { t } = useLang();
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
