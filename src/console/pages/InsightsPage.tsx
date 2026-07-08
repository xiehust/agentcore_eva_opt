import { useState } from "react";
import { Badge, Button, Card } from "../../components/ui";
import { LiveRunButton } from "../../components/LiveRunButton";
import { useLiveApi } from "../../lib/useLiveApi";
import { useResource } from "../../lib/useResource";
import { useConsole } from "../../state/console";
import { useLang } from "../../i18n/lang";
import type {
  ExecutionSummaryCluster,
  FailureCategory,
  InsightReportRecord,
  InsightReportStatus,
  UserIntentCluster,
} from "../../lib/liveApi";

const STATUS_VARIANT: Record<InsightReportStatus, "neutral" | "warn" | "ok" | "danger"> = {
  pending: "neutral",
  analyzing: "warn",
  completed: "ok",
  failed: "danger",
};

export const INSIGHT_TYPES = [
  "Builtin.Insight.FailureAnalysis",
  "Builtin.Insight.UserIntent",
  "Builtin.Insight.ExecutionSummary",
] as const;

/**
 * Insights: run failure-analysis / user-intent / execution-summary triage over
 * an agent's sessions (a past run's sessions or a lookback window) and browse
 * report history. Reuses the batch-evaluation API — insights INSTEAD of
 * evaluators (mutually exclusive), one active batch evaluation per account.
 */
export function InsightsPage() {
  const { api, creds } = useLiveApi();
  const { state } = useConsole();
  const { t } = useLang();
  const agents = useResource(() => api.listAgents(), []);
  const runs = useResource(() => api.listRuns(), []);
  const reports = useResource(() => api.listInsightReports(), []);

  // Insights read telemetry, not the runtime: deployed managed agents AND
  // external agents (registered by telemetry binding) both qualify.
  const evaluableAgents = (agents.data?.agents ?? []).filter(
    (a) => a.deployment?.status === "deployed" || (a.kind === "external" && a.binding),
  );
  const [agentId, setAgentId] = useState<string>(state.insightDraft?.agentId ?? "");
  const [scope, setScope] = useState<"run" | "lookback">("run");
  const [runId, setRunId] = useState<string>(state.insightDraft?.runId ?? "");
  const [lookbackHours, setLookbackHours] = useState<number>(24);
  const [selected, setSelected] = useState<Set<string>>(new Set(INSIGHT_TYPES));
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  const effectiveAgentId = agentId || evaluableAgents[0]?.id || "";
  // Runs eligible for session-scoped analysis: same agent, has session ids.
  const agentRuns = (runs.data?.runs ?? []).filter(
    (r) => r.agentId === effectiveAgentId && (r.sessionIds?.length ?? 0) > 0,
  );
  const effectiveRunId = runId || agentRuns[0]?.id || "";

  const toggleInsight = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canStart =
    effectiveAgentId !== "" &&
    selected.size > 0 &&
    (scope === "lookback" ? lookbackHours >= 1 : effectiveRunId !== "");

  const selectCls =
    "w-full rounded-md border border-line bg-ink-900/60 px-3 py-2 text-sm text-fog-100 outline-none focus:border-cyan/60";

  const selectedReport =
    reports.data?.reports.find((r) => r.id === selectedReportId) ??
    reports.data?.reports[0] ??
    null;

  return (
    <div className="space-y-4">
      <Card
        eyebrow={t.console.insights.newEyebrow}
        title={t.console.insights.newTitle}
        accent="orange"
      >
        <div className="space-y-4">
          <p className="text-xs leading-relaxed text-fog-400">{t.console.insights.intro}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="eyebrow mb-1 block">{t.console.insights.pickAgent}</span>
              <select
                value={effectiveAgentId}
                onChange={(e) => {
                  setAgentId(e.target.value);
                  setRunId("");
                }}
                className={selectCls}
              >
                {evaluableAgents.length === 0 && <option value="">—</option>}
                {evaluableAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.kind === "external" ? ` (${t.console.agents.externalBadge})` : ""}
                  </option>
                ))}
              </select>
              {evaluableAgents.length === 0 && (
                <span className="mt-1 block text-[11px] text-warn">
                  {t.console.runs.noEvaluableAgents}
                </span>
              )}
            </label>
            <div>
              <span className="eyebrow mb-1 block">{t.console.insights.scope}</span>
              <div className="flex gap-1.5">
                {(["run", "lookback"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScope(s)}
                    aria-pressed={scope === s}
                    className={`rounded-md border px-3 py-2 text-xs transition-colors ${
                      scope === s
                        ? "border-aws-orange/60 bg-ink-700/80 text-fog-100"
                        : "border-line bg-ink-750/40 text-fog-300 hover:border-cyan/40"
                    }`}
                  >
                    {t.console.insights.scopes[s]}
                  </button>
                ))}
              </div>
              {scope === "run" ? (
                <div className="mt-2">
                  <select
                    value={effectiveRunId}
                    onChange={(e) => setRunId(e.target.value)}
                    className={selectCls}
                    aria-label={t.console.insights.pickRun}
                  >
                    {agentRuns.length === 0 && <option value="">—</option>}
                    {agentRuns.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.datasetName} · {new Date(r.createdAt * 1000).toLocaleString()} (
                        {r.sessionIds?.length ?? 0})
                      </option>
                    ))}
                  </select>
                  {agentRuns.length === 0 && (
                    <span className="mt-1 block text-[11px] text-warn">
                      {t.console.insights.noRuns}
                    </span>
                  )}
                </div>
              ) : (
                <label className="mt-2 flex items-center gap-2 text-sm text-fog-200">
                  <input
                    type="number"
                    min={1}
                    max={336}
                    value={lookbackHours}
                    onChange={(e) => setLookbackHours(Number(e.target.value))}
                    className="w-24 rounded-md border border-line bg-ink-900/60 px-3 py-2 text-sm text-fog-100 outline-none focus:border-cyan/60"
                    aria-label={t.console.insights.lookbackLabel}
                  />
                  {t.console.insights.lookbackUnit}
                </label>
              )}
            </div>
          </div>

          <div>
            <span className="eyebrow mb-2 block">{t.console.insights.pickInsights}</span>
            <div className="grid gap-1.5 sm:grid-cols-3">
              {INSIGHT_TYPES.map((id) => (
                <label
                  key={id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md border border-line bg-ink-750/40 px-3 py-2 text-sm text-fog-200 hover:border-cyan/40"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(id)}
                    onChange={() => toggleInsight(id)}
                    className="accent-aws-orange"
                  />
                  <span>{t.console.insights.types[id]}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            {!canStart && <Button disabled>{t.console.insights.startBtn}</Button>}
            {canStart && (
              <LiveRunButton
                label={t.console.insights.startBtn}
                doneLabel={t.console.insights.status.completed}
                run={async (onProgress) => {
                  const { jobId, reportId } = await api.createInsightReport({
                    agentId: effectiveAgentId,
                    insights: Array.from(selected),
                    ...(scope === "run"
                      ? { runId: effectiveRunId }
                      : { lookbackHours }),
                    creds: creds ?? null,
                  });
                  setSelectedReportId(reportId);
                  reports.reload();
                  const result = await api.pollJob(jobId, {
                    onProgress: (s) => s.progress && onProgress(s.progress),
                  });
                  reports.reload();
                  return result;
                }}
              />
            )}
            <p className="mt-1.5 text-[11px] leading-relaxed text-fog-500">
              {t.console.insights.startedHint}
            </p>
          </div>
        </div>
      </Card>

      <Card
        eyebrow={t.console.insights.historyEyebrow}
        title={t.console.insights.historyTitle}
        accent="cyan"
        action={
          <Button size="sm" variant="ghost" onClick={reports.reload}>
            {t.console.common.refresh}
          </Button>
        }
      >
        {reports.loading && <p className="text-sm text-fog-500">{t.console.common.loading}</p>}
        {reports.error && <p className="text-sm text-danger">{reports.error}</p>}
        {reports.data && reports.data.reports.length === 0 && (
          <p className="text-sm text-fog-400">{t.console.insights.emptyHistory}</p>
        )}
        <ul className="space-y-2">
          {reports.data?.reports.map((report) => (
            <li key={report.id}>
              <button
                type="button"
                onClick={() => setSelectedReportId(report.id)}
                aria-current={selectedReport?.id === report.id ? "true" : undefined}
                className={`flex w-full flex-wrap items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${
                  selectedReport?.id === report.id
                    ? "border-cyan/50 bg-ink-700/70"
                    : "border-line bg-ink-750/40 hover:border-cyan/30"
                }`}
              >
                <span className="text-sm font-semibold text-fog-100">{report.agentName}</span>
                <span className="font-mono text-[11px] text-fog-500">
                  {report.source.startsWith("run:")
                    ? t.console.insights.sourceRun
                    : t.console.insights.sourceLookback}
                </span>
                <Badge
                  variant={STATUS_VARIANT[report.status]}
                  dot
                  pulse={report.status === "analyzing" || report.status === "pending"}
                  mono
                >
                  {t.console.insights.status[report.status]}
                </Badge>
                <span className="ml-auto font-mono text-[11px] text-fog-500">
                  {new Date(report.createdAt * 1000).toLocaleString()}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {selectedReport && (
          <ReportDetail
            report={selectedReport}
            onDelete={async () => {
              await api.deleteInsightReport(selectedReport.id);
              setSelectedReportId(null);
              reports.reload();
            }}
            onResume={async () => {
              if (!selectedReport.jobId) return;
              await api.pollJob(selectedReport.jobId);
              reports.reload();
            }}
          />
        )}
      </Card>
    </div>
  );
}

function ReportDetail({
  report,
  onDelete,
  onResume,
}: {
  report: InsightReportRecord;
  onDelete: () => Promise<void>;
  onResume: () => Promise<void>;
}) {
  const { t } = useLang();
  const inFlight =
    (report.status === "pending" || report.status === "analyzing") && report.jobId;
  const results = report.results;
  return (
    <div className="mt-4 border-t border-line/60 pt-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1">
        <span className="eyebrow">{t.console.insights.reportEyebrow}</span>
        {report.batchEvaluationId && (
          <span className="font-mono text-[11px] text-fog-500">
            {t.console.runs.batchId}: {report.batchEvaluationId}
          </span>
        )}
        {report.sessionIds && (
          <span className="font-mono text-[11px] text-fog-500">
            {t.console.runs.sessions(report.sessionIds.length)}
          </span>
        )}
        <span className="ml-auto">
          <Button size="sm" variant="ghost" onClick={onDelete}>
            {t.console.common.delete}
          </Button>
        </span>
      </div>
      {report.error && (
        <div
          role="alert"
          className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          {report.error}
        </div>
      )}
      {inFlight && (
        <LiveRunButton
          label={t.console.insights.resume}
          doneLabel={t.console.insights.status.completed}
          variant="secondary"
          run={onResume}
        />
      )}
      {results && (
        <div className="space-y-5">
          {results.failures && <FailureTree failures={results.failures} />}
          {results.userIntents && <IntentClusters intents={results.userIntents} />}
          {results.executionSummaries && (
            <ExecutionClusters summaries={results.executionSummaries} />
          )}
        </div>
      )}
    </div>
  );
}

/** Failure analysis: categories → subcategories → root causes (with fixes). */
function FailureTree({ failures }: { failures: FailureCategory[] }) {
  const { t } = useLang();
  return (
    <section>
      <h4 className="eyebrow mb-2">{t.console.insights.failuresTitle}</h4>
      {failures.length === 0 && (
        <p className="text-sm text-ok">{t.console.insights.noFailures}</p>
      )}
      <div className="space-y-2">
        {failures.map((cat, i) => (
          <details
            key={cat.clusterId ?? i}
            open={i === 0}
            className="rounded-md border border-danger/30 bg-ink-750/40"
          >
            <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-3 py-2.5">
              <span className="text-sm font-semibold text-fog-100">{cat.name}</span>
              <Badge variant="danger" mono>
                {t.console.insights.sessionCount(cat.affectedSessionCount)}
              </Badge>
              {cat.description && (
                <span className="w-full text-xs text-fog-400 sm:ml-auto sm:w-auto">
                  {cat.description}
                </span>
              )}
            </summary>
            <div className="space-y-2 border-t border-line/60 px-3 py-2.5">
              {(cat.subCategories ?? []).map((sub, j) => (
                <div key={sub.clusterId ?? j} className="rounded border border-line/60 bg-ink-900/40 p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-fog-200">{sub.name}</span>
                    <Badge variant="warn" mono>
                      {t.console.insights.sessionCount(sub.affectedSessionCount)}
                    </Badge>
                  </div>
                  {(sub.rootCauses ?? []).map((rc, k) => (
                    <div key={k} className="mt-2 border-l-2 border-aws-orange/50 pl-3">
                      <p className="text-xs text-fog-200">{rc.name}</p>
                      {rc.recommendation && (
                        <p className="mt-1 text-[11px] leading-relaxed text-cyan">
                          <span className="font-semibold">
                            {t.console.insights.recommendation}:
                          </span>{" "}
                          {rc.recommendation}
                        </p>
                      )}
                      <p className="mt-0.5 font-mono text-[10px] text-fog-500">
                        {t.console.insights.sessionCount(rc.affectedSessionCount)}
                      </p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
      {failures.length > 0 && (
        <p className="mt-2 text-[11px] leading-relaxed text-fog-500">
          {t.console.insights.toExperimentsHint}
        </p>
      )}
    </section>
  );
}

function IntentClusters({ intents }: { intents: UserIntentCluster[] }) {
  const { t } = useLang();
  return (
    <section>
      <h4 className="eyebrow mb-2">{t.console.insights.intentsTitle}</h4>
      <div className="grid gap-2 sm:grid-cols-2">
        {intents.map((c, i) => (
          <div key={c.clusterId ?? i} className="rounded-md border border-line bg-ink-750/40 p-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-fog-100">{c.name}</span>
              <Badge variant="cyan" mono className="ml-auto">
                {t.console.insights.sessionCount(c.affectedSessionCount)}
              </Badge>
            </div>
            {c.description && (
              <p className="mt-1 text-xs leading-relaxed text-fog-400">{c.description}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function ExecutionClusters({ summaries }: { summaries: ExecutionSummaryCluster[] }) {
  const { t } = useLang();
  return (
    <section>
      <h4 className="eyebrow mb-2">{t.console.insights.executionTitle}</h4>
      <div className="grid gap-2 sm:grid-cols-2">
        {summaries.map((c, i) => (
          <div key={c.clusterId ?? i} className="rounded-md border border-line bg-ink-750/40 p-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-fog-100">{c.name}</span>
              <Badge variant="neutral" mono className="ml-auto">
                {t.console.insights.sessionCount(c.affectedSessionCount)}
              </Badge>
            </div>
            {c.description && (
              <p className="mt-1 text-xs leading-relaxed text-fog-400">{c.description}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
