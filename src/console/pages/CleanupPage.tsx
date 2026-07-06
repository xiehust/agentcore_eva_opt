import { useState } from "react";
import { Badge, Button, Card } from "../../components/ui";
import { LiveRunButton } from "../../components/LiveRunButton";
import { useLiveApi } from "../../lib/useLiveApi";
import { useResource } from "../../lib/useResource";
import { useLang } from "../../i18n/lang";
import type { ExperimentRecord } from "../../lib/liveApi";

interface CleanupIds {
  abTestIds: string[];
  onlineEvalIds: string[];
  bundleIds: string[];
  gatewayId?: string;
  targetIds: string[];
}

/** Collect the AWS resource ids an experiment created (agents excluded —
 * runtimes/roles are shared resources, undeployed from the Agents page). */
function collectCleanupIds(exp: ExperimentRecord): CleanupIds {
  const a = exp.artifacts;
  return {
    abTestIds: [a.bundleAbTestId, a.targetAbTestId].filter(Boolean) as string[],
    onlineEvalIds: [a.onlineEvalIdV1, a.onlineEvalIdV2].filter(Boolean) as string[],
    bundleIds: [a.controlBundleId, a.treatmentBundleId].filter(Boolean) as string[],
    gatewayId: a.gatewayId,
    targetIds: [a.targetIdV1, a.targetIdV2].filter(Boolean) as string[],
  };
}

function countResources(ids: CleanupIds): number {
  return (
    ids.abTestIds.length +
    ids.onlineEvalIds.length +
    ids.bundleIds.length +
    (ids.gatewayId ? 1 : 0) +
    ids.targetIds.length
  );
}

/** Cleanup: per-experiment teardown of gateway/A/B/bundles/online-evals. */
export function CleanupPage() {
  const { api, creds } = useLiveApi();
  const { t } = useLang();
  const experiments = useResource(() => api.listExperiments(), []);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <Card eyebrow={t.console.cleanup.eyebrow} title={t.console.cleanup.title} accent="danger">
      <p className="mb-3 text-[11px] leading-relaxed text-fog-500">{t.console.cleanup.undeployHint}</p>
      {error && (
        <div role="alert" className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}
      {experiments.loading && <p className="text-sm text-fog-500">{t.console.common.loading}</p>}
      {experiments.data && experiments.data.experiments.length === 0 && (
        <p className="text-sm text-fog-400">{t.console.cleanup.empty}</p>
      )}
      <ul className="space-y-3">
        {experiments.data?.experiments.map((exp) => {
          const ids = collectCleanupIds(exp);
          const total = countResources(ids);
          const cleaned = exp.artifacts.cleanedAt !== undefined;
          return (
            <li key={exp.id} className="rounded-md border border-line bg-ink-750/60 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-display text-sm font-semibold text-fog-100">{exp.name}</span>
                <span className="font-mono text-[11px] text-fog-500">{exp.agentName}</span>
                {cleaned ? (
                  <Badge variant="ok" dot mono>
                    {t.console.cleanup.teardownDone}
                  </Badge>
                ) : (
                  <Badge variant="neutral" mono>
                    {t.console.experiments.stages[exp.stage]}
                  </Badge>
                )}
                <span className="ml-auto">
                  {(cleaned || exp.stage === "done") && (
                    confirmId === exp.id ? (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          setConfirmId(null);
                          void api.deleteExperiment(exp.id).then(experiments.reload).catch(
                            (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
                          );
                        }}
                      >
                        {t.console.common.confirmDelete}
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setConfirmId(exp.id)}>
                        {t.console.cleanup.deleteRecordBtn}
                      </Button>
                    )
                  )}
                </span>
              </div>

              {/* Resource chips */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {total === 0 && (
                  <span className="text-[11px] text-fog-500">{t.console.cleanup.noResources}</span>
                )}
                {ids.gatewayId && <Badge variant="neutral" mono>gw: {ids.gatewayId}</Badge>}
                {ids.abTestIds.map((id) => (
                  <Badge key={id} variant="neutral" mono>
                    ab: {id}
                  </Badge>
                ))}
                {ids.bundleIds.map((id) => (
                  <Badge key={id} variant="neutral" mono>
                    bundle: {id}
                  </Badge>
                ))}
                {ids.targetIds.map((id) => (
                  <Badge key={id} variant="neutral" mono>
                    target: {id}
                  </Badge>
                ))}
                {ids.onlineEvalIds.map((id) => (
                  <Badge key={id} variant="neutral" mono>
                    eval: {id}
                  </Badge>
                ))}
              </div>

              {/* Teardown */}
              {total > 0 && !cleaned && (
                <div className="mt-3 border-t border-line/60 pt-3">
                  <LiveRunButton
                    label={t.console.cleanup.teardownBtn}
                    doneLabel={t.console.cleanup.teardownDone}
                    variant="secondary"
                    run={async (onProgress) => {
                      onProgress(t.console.cleanup.resources);
                      const res = await api.cleanup({
                        abTestIds: ids.abTestIds,
                        onlineEvalIds: ids.onlineEvalIds,
                        bundleIds: ids.bundleIds,
                        gatewayId: ids.gatewayId,
                        targetIds: ids.targetIds,
                        creds: creds ?? null,
                      });
                      await api.updateExperiment(exp.id, {
                        stage: "done",
                        artifacts: { cleanupResults: res.results, cleanedAt: Date.now() / 1000 },
                      });
                      experiments.reload();
                      return res;
                    }}
                    onComplete={() => experiments.reload()}
                  />
                </div>
              )}

              {/* Results table */}
              {exp.artifacts.cleanupResults && (
                <div className="mt-3 border-t border-line/60 pt-3">
                  <span className="mb-1 block font-mono text-[11px] text-fog-500">
                    {t.console.cleanup.resultsDeleted(
                      exp.artifacts.cleanupResults.filter((r) => r.status === "deleted").length,
                      exp.artifacts.cleanupResults.length,
                    )}
                  </span>
                  <ul className="space-y-0.5">
                    {exp.artifacts.cleanupResults.map((r) => (
                      <li key={r.category} className="flex items-center gap-2 font-mono text-[11px]">
                        <span className={r.status === "deleted" ? "text-ok" : "text-warn"}>
                          {r.status === "deleted" ? "✓" : "–"}
                        </span>
                        <span className="text-fog-400">{r.category}</span>
                        {r.detail && <span className="truncate text-fog-600">{r.detail}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
