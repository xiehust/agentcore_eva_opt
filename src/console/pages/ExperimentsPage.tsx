import { useState } from "react";
import { Badge, Button, Card } from "../../components/ui";
import { LiveRunButton } from "../../components/LiveRunButton";
import { DiffView } from "../../components/DiffView";
import { LazyABChart } from "../../components/LazyABChart";
import { useLiveApi } from "../../lib/useLiveApi";
import { useResource } from "../../lib/useResource";
import { useConsole } from "../../state/console";
import { useLang } from "../../i18n/lang";
import { experimentNames } from "../../lib/experimentNames";
import { promoteVerdict, verdictSentence } from "../../lib/abVerdict";
import {
  EXPERIMENT_STAGES,
  legacyItems,
  type ABTestMetric,
  type AgentRecord,
  type ExperimentRecord,
  type ExperimentStage,
  type LiveApi,
} from "../../lib/liveApi";
import type { LiveCreds } from "../../state/journey";

/** Optimization experiments: recommend → bundles → A/B → promote → canary. */
export function ExperimentsPage() {
  const { state, dispatch } = useConsole();
  if (state.viewingExperimentId) {
    return (
      <ExperimentDetail
        experimentId={state.viewingExperimentId}
        onClose={() => dispatch({ type: "OPEN_EXPERIMENT", experimentId: undefined })}
      />
    );
  }
  return <ExperimentList />;
}

function stageIndex(stage: ExperimentStage): number {
  return EXPERIMENT_STAGES.indexOf(stage);
}

const STAGE_VARIANT: Record<ExperimentStage, "neutral" | "warn" | "cyan" | "ok"> = {
  recommend: "neutral",
  bundles: "cyan",
  abtest: "warn",
  monitor: "warn",
  promoted: "ok",
  canary: "warn",
  canary_monitor: "warn",
  done: "ok",
};

// ─── List + create ──────────────────────────────────────────────────────────
function ExperimentList() {
  const { api } = useLiveApi();
  const { dispatch } = useConsole();
  const { t } = useLang();
  const experiments = useResource(() => api.listExperiments(), []);
  const agents = useResource(() => api.listAgents(), []);
  const [name, setName] = useState("");
  const [agentId, setAgentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const deployed = (agents.data?.agents ?? []).filter(
    (a) => a.deployment?.status === "deployed",
  );
  const effectiveAgentId = agentId || deployed[0]?.id || "";
  const selectedAgent = deployed.find((a) => a.id === effectiveAgentId);
  const missingConfig = selectedAgent != null && !selectedAgent.config?.systemPrompt;

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createExperiment({
        name: name.trim() || `Experiment ${new Date().toISOString().slice(0, 10)}`,
        agentId: effectiveAgentId,
      });
      dispatch({ type: "OPEN_EXPERIMENT", experimentId: created.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "w-full rounded-md border border-line bg-ink-900/60 px-3 py-2 text-sm text-fog-100 outline-none focus:border-cyan/60";

  return (
    <div className="space-y-4">
      <Card eyebrow={t.console.experiments.eyebrow} title={t.console.experiments.createTitle} accent="orange">
        {error && (
          <div role="alert" className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="eyebrow mb-1 block">{t.console.common.name}</span>
            <input
              value={name}
              placeholder={t.console.experiments.namePlaceholder}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="eyebrow mb-1 block">{t.console.experiments.pickAgent}</span>
            <select value={effectiveAgentId} onChange={(e) => setAgentId(e.target.value)} className={inputCls}>
              {deployed.length === 0 && <option value="">—</option>}
              {deployed.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            {deployed.length === 0 && !agents.loading && (
              <span className="mt-1 block text-[11px] text-warn">{t.console.runs.noDeployedAgents}</span>
            )}
            {missingConfig && (
              <span className="mt-1 block text-[11px] text-warn">{t.console.experiments.noConfigWarning}</span>
            )}
          </label>
        </div>
        <div className="mt-4">
          <Button disabled={busy || !effectiveAgentId || missingConfig} onClick={() => void create()}>
            {t.console.experiments.create}
          </Button>
        </div>
      </Card>

      <Card eyebrow={t.console.experiments.eyebrow} title={t.console.experiments.title} accent="cyan">
        {experiments.loading && <p className="text-sm text-fog-500">{t.console.common.loading}</p>}
        {experiments.data && experiments.data.experiments.length === 0 && (
          <p className="text-sm text-fog-400">{t.console.experiments.empty}</p>
        )}
        <ul className="space-y-2">
          {experiments.data?.experiments.map((exp) => (
            <li key={exp.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-ink-750/60 px-4 py-3">
              <div className="min-w-0">
                <span className="font-display text-sm font-semibold text-fog-100">{exp.name}</span>
                <span className="ml-2 font-mono text-[11px] text-fog-500">{exp.agentName}</span>
              </div>
              <Badge variant={STAGE_VARIANT[exp.stage]} dot mono>
                {t.console.experiments.stages[exp.stage]}
              </Badge>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => dispatch({ type: "OPEN_EXPERIMENT", experimentId: exp.id })}>
                  {t.console.experiments.open}
                </Button>
                {confirmId === exp.id ? (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      setConfirmId(null);
                      void api.deleteExperiment(exp.id).then(experiments.reload).catch((e: unknown) =>
                        setError(e instanceof Error ? e.message : String(e)),
                      );
                    }}
                  >
                    {t.console.common.confirmDelete}
                  </Button>
                ) : (
                  <Button size="sm" variant="danger" onClick={() => setConfirmId(exp.id)}>
                    {t.console.common.delete}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// ─── Detail: shared stage helpers ───────────────────────────────────────────
interface StageContext {
  api: LiveApi;
  creds: LiveCreds | null;
  exp: ExperimentRecord;
  agent: AgentRecord;
  reload: () => void;
}

/** Persist an artifacts patch (+ optional stage bump) and refresh the view. */
async function putArtifacts(
  ctx: StageContext,
  artifacts: ExperimentRecord["artifacts"],
  stage?: ExperimentStage,
): Promise<void> {
  await ctx.api.updateExperiment(ctx.exp.id, { artifacts, ...(stage ? { stage } : {}) });
  ctx.reload();
}

/** Poll GET /abtest/{id} every 30s until results are aggregated (25 min cap). */
async function monitorAbTest(
  api: LiveApi,
  abTestId: string,
  onProgress: (msg: string) => void,
): Promise<{ metrics: ABTestMetric[]; analysisTimestamp: string }> {
  const deadline = Date.now() + 25 * 60 * 1000;
  for (;;) {
    const res = (await api.getAbTest(abTestId)) as {
      status?: string;
      executionStatus?: string;
      analysisTimestamp?: string;
      metrics?: ABTestMetric[];
    };
    onProgress(
      `status ${res.status ?? "?"} / ${res.executionStatus ?? "?"}${
        res.analysisTimestamp ? " · analyzed" : " · aggregating"
      }`,
    );
    if (res.analysisTimestamp && res.metrics && res.metrics.length > 0) {
      return { metrics: res.metrics, analysisTimestamp: res.analysisTimestamp };
    }
    if (Date.now() > deadline) throw new Error("A/B results not ready within 25 minutes");
    await new Promise((r) => setTimeout(r, 30_000));
  }
}

// ─── Detail ─────────────────────────────────────────────────────────────────
function ExperimentDetail({ experimentId, onClose }: { experimentId: string; onClose: () => void }) {
  const { api, creds } = useLiveApi();
  const { t } = useLang();
  const experiment = useResource(() => api.getExperiment(experimentId), [experimentId]);
  const exp = experiment.data;
  const agentRes = useResource(
    () => (exp ? api.getAgent(exp.agentId) : Promise.resolve(null)),
    [exp?.agentId],
  );
  const agent = agentRes.data;

  if (!exp || !agent) {
    return (
      <Card eyebrow={t.console.experiments.eyebrow} title={t.console.common.loading} accent="orange">
        {(experiment.error || agentRes.error) && (
          <p className="text-sm text-danger">{experiment.error ?? agentRes.error}</p>
        )}
      </Card>
    );
  }

  const ctx: StageContext = { api, creds: creds ?? null, exp, agent, reload: experiment.reload };
  const idx = stageIndex(exp.stage);

  return (
    <div className="space-y-4">
      <Card
        eyebrow={t.console.experiments.eyebrow}
        title={exp.name}
        accent="orange"
        action={
          <div className="flex items-center gap-2">
            <Badge variant={STAGE_VARIANT[exp.stage]} dot mono>
              {t.console.experiments.stages[exp.stage]}
            </Badge>
            <Button size="sm" variant="ghost" onClick={onClose}>
              {t.console.common.back}
            </Button>
          </div>
        }
      >
        <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-fog-500">
          <span>{exp.agentName}</span>
          {agent.deployment?.runtimeArn && <span className="truncate">{agent.deployment.runtimeArn}</span>}
          {exp.artifacts.gatewayId && <span>gw: {exp.artifacts.gatewayId}</span>}
          {exp.artifacts.bundleAbTestId && <span>ab: {exp.artifacts.bundleAbTestId}</span>}
          {exp.artifacts.targetAbTestId && <span>canary: {exp.artifacts.targetAbTestId}</span>}
        </div>
      </Card>

      <RecommendStage ctx={ctx} />
      {idx >= stageIndex("bundles") && <BundlesStage ctx={ctx} />}
      {idx >= stageIndex("abtest") && <AbTestStage ctx={ctx} />}
      {idx >= stageIndex("promoted") && <CanaryStage ctx={ctx} />}
      {exp.stage === "done" && (
        <Card title={t.console.experiments.doneTitle} accent="cyan">
          <p className="text-sm text-fog-400">{t.console.experiments.doneBody}</p>
        </Card>
      )}
    </div>
  );
}

// ─── Stage 1: Recommendations ───────────────────────────────────────────────
function RecommendStage({ ctx }: { ctx: StageContext }) {
  const { t } = useLang();
  const { api, creds, exp, agent } = ctx;
  const a = exp.artifacts;
  const config = agent.config ?? { systemPrompt: "", toolDescriptions: {} };
  const names = experimentNames(exp.id, exp.agentName);
  const deployment = agent.deployment;
  const active = exp.stage === "recommend";

  const [editedSp, setEditedSp] = useState<string | null>(null);
  const [editedTd, setEditedTd] = useState<string | null>(null);

  const recommendedSp = a.recommendedSystemPrompt;
  const recommendedTd = a.recommendedToolDescriptions;
  const acceptedSp = editedSp ?? recommendedSp ?? config.systemPrompt;
  const acceptedTdText =
    editedTd ?? JSON.stringify(recommendedTd ?? config.toolDescriptions, null, 2);

  const runSp = async (onProgress: (m: string) => void) => {
    const { jobId } = await api.recommendSystemPrompt({
      name: names.spRecommendation,
      systemPrompt: config.systemPrompt,
      logGroupArns: deployment?.logGroup ? [deployment.logGroup] : [],
      serviceNames: deployment?.serviceName ? [deployment.serviceName] : [],
      creds,
    });
    await putArtifacts(ctx, { recommendSpJobId: jobId });
    const result = await api.pollJob<{ recommendedSystemPrompt: string; usedFallback?: boolean }>(
      jobId,
      { onProgress: (s) => s.progress && onProgress(s.progress) },
    );
    await putArtifacts(ctx, {
      recommendedSystemPrompt: result.recommendedSystemPrompt,
      usedFallbackSp: result.usedFallback ?? false,
    });
    return result;
  };

  const runTd = async (onProgress: (m: string) => void) => {
    const { jobId } = await api.recommendToolDescriptions({
      name: names.tdRecommendation,
      tools: Object.entries(config.toolDescriptions).map(([toolName, description]) => ({
        toolName,
        description,
      })),
      logGroupArns: deployment?.logGroup ? [deployment.logGroup] : [],
      serviceNames: deployment?.serviceName ? [deployment.serviceName] : [],
      creds,
    });
    await putArtifacts(ctx, { recommendTdJobId: jobId });
    const result = await api.pollJob<{
      recommendedToolDescriptions: Record<string, string>;
      usedFallback?: boolean;
    }>(jobId, { onProgress: (s) => s.progress && onProgress(s.progress) });
    await putArtifacts(ctx, {
      recommendedToolDescriptions: result.recommendedToolDescriptions,
      usedFallbackTd: result.usedFallback ?? false,
    });
    return result;
  };

  const accept = async () => {
    let td: Record<string, string>;
    try {
      td = JSON.parse(acceptedTdText) as Record<string, string>;
    } catch {
      td = recommendedTd ?? config.toolDescriptions;
    }
    await putArtifacts(
      ctx,
      { acceptedSystemPrompt: acceptedSp, acceptedToolDescriptions: td },
      "bundles",
    );
  };

  return (
    <Card eyebrow={t.console.experiments.stages.recommend} title={t.console.experiments.recommend.title} accent={active ? "orange" : "none"}>
      <p className="mb-3 text-[11px] leading-relaxed text-fog-500">
        {t.console.experiments.recommend.hintNeedsTraces}
      </p>
      {(a.usedFallbackSp || a.usedFallbackTd) && (
        <div className="mb-3 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          {t.console.experiments.recommend.usedFallback}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <LiveRunButton
          label={t.console.experiments.recommend.spBtn}
          doneLabel={t.console.experiments.stages.recommend}
          variant="secondary"
          run={runSp}
        />
        <LiveRunButton
          label={t.console.experiments.recommend.tdBtn}
          doneLabel={t.console.experiments.stages.recommend}
          variant="secondary"
          run={runTd}
        />
      </div>

      {recommendedSp !== undefined && (
        <div className="mt-4">
          <DiffView
            before={config.systemPrompt}
            after={recommendedSp}
            beforeLabel={t.console.experiments.recommend.currentLabel}
            afterLabel={t.console.experiments.recommend.recommendedLabel}
          />
        </div>
      )}
      {recommendedTd !== undefined && (
        <div className="mt-4">
          <DiffView
            before={JSON.stringify(config.toolDescriptions, null, 2)}
            after={JSON.stringify(recommendedTd, null, 2)}
            beforeLabel={t.console.experiments.recommend.currentLabel}
            afterLabel={t.console.experiments.recommend.recommendedLabel}
          />
        </div>
      )}

      {active && (recommendedSp !== undefined || recommendedTd !== undefined) && (
        <div className="mt-4 space-y-3">
          <p className="text-[11px] text-fog-500">{t.console.experiments.recommend.editHint}</p>
          <textarea
            value={acceptedSp}
            rows={5}
            onChange={(e) => setEditedSp(e.target.value)}
            className="w-full rounded-md border border-line bg-ink-900/60 px-3 py-2 font-mono text-xs text-fog-100 outline-none focus:border-cyan/60"
          />
          <textarea
            value={acceptedTdText}
            rows={5}
            spellCheck={false}
            onChange={(e) => setEditedTd(e.target.value)}
            className="w-full rounded-md border border-line bg-ink-900/60 px-3 py-2 font-mono text-xs text-fog-100 outline-none focus:border-cyan/60"
          />
          <Button onClick={() => void accept()}>{t.console.experiments.recommend.acceptBtn}</Button>
        </div>
      )}
    </Card>
  );
}

// ─── Stage 2: Bundles ───────────────────────────────────────────────────────
function BundlesStage({ ctx }: { ctx: StageContext }) {
  const { t } = useLang();
  const { api, creds, exp, agent } = ctx;
  const a = exp.artifacts;
  const config = agent.config ?? { systemPrompt: "", toolDescriptions: {} };
  const names = experimentNames(exp.id, exp.agentName);
  const created = a.controlBundleId !== undefined;

  const createBundles = async (onProgress: (m: string) => void) => {
    const agentArn = agent.deployment?.runtimeArn ?? "";
    onProgress("creating control bundle");
    const control = await api.createBundle({
      agentArn,
      name: names.controlBundle,
      systemPrompt: config.systemPrompt,
      toolDescriptions: config.toolDescriptions,
      commitMessage: "Control: current config",
      creds,
    });
    onProgress("creating treatment bundle");
    const treatment = await api.createBundle({
      agentArn,
      name: names.treatmentBundle,
      systemPrompt: a.acceptedSystemPrompt ?? config.systemPrompt,
      toolDescriptions: a.acceptedToolDescriptions ?? config.toolDescriptions,
      commitMessage: "Treatment: accepted recommendation",
      creds,
    });
    await putArtifacts(
      ctx,
      {
        controlBundleId: control.bundleId,
        controlBundleVersion: control.versionId,
        treatmentBundleId: treatment.bundleId,
        treatmentBundleVersion: treatment.versionId,
      },
      "abtest",
    );
    return { control, treatment };
  };

  return (
    <Card eyebrow={t.console.experiments.stages.bundles} title={t.console.experiments.bundles.title} accent={exp.stage === "bundles" ? "orange" : "none"}>
      <p className="mb-3 text-[11px] leading-relaxed text-fog-500">{t.console.experiments.bundles.hookNote}</p>
      <DiffView
        before={config.systemPrompt}
        after={a.acceptedSystemPrompt ?? config.systemPrompt}
        beforeLabel={t.console.experiments.bundles.controlLabel}
        afterLabel={t.console.experiments.bundles.treatmentLabel}
      />
      <div className="mt-4">
        {created ? (
          <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-fog-500">
            <span>control: {a.controlBundleId} @ {a.controlBundleVersion}</span>
            <span>treatment: {a.treatmentBundleId} @ {a.treatmentBundleVersion}</span>
          </div>
        ) : (
          <LiveRunButton
            label={t.console.experiments.bundles.createBtn}
            doneLabel={t.console.experiments.stages.bundles}
            run={createBundles}
          />
        )}
      </div>
    </Card>
  );
}

// ─── Stage 3: Gateway + config-bundle A/B ───────────────────────────────────
function AbTestStage({ ctx }: { ctx: StageContext }) {
  const { t } = useLang();
  const { api, creds, exp, agent } = ctx;
  const a = exp.artifacts;
  const names = experimentNames(exp.id, exp.agentName);
  const datasets = useResource(() => api.listDatasets(), []);
  const [datasetId, setDatasetId] = useState("");
  const effectiveDatasetId = datasetId || a.gwTrafficDatasetId || datasets.data?.datasets[0]?.id || "";

  const setup = async (onProgress: (m: string) => void) => {
    const deployment = agent.deployment;
    const { jobId } = await api.gatewaySetup({
      name: names.gateway,
      roleArn: a.roleArn ?? deployment?.roleArn ?? "",
      agentArn: deployment?.runtimeArn,
      targetName: names.targetV1,
      onlineEvalName: names.onlineEvalV1,
      logGroup: deployment?.logGroup,
      serviceName: deployment?.serviceName,
      description: `Experiment ${exp.id} gateway`,
      creds,
    });
    await putArtifacts(ctx, { gatewaySetupJobId: jobId, targetNameV1: names.targetV1 });
    const gw = await api.pollJob<{
      gatewayId: string;
      gatewayArn: string;
      targetId: string;
      onlineEvalArn: string;
      onlineEvalId: string;
      roleArn: string;
    }>(jobId, { onProgress: (s) => s.progress && onProgress(s.progress) });
    await putArtifacts(ctx, {
      gatewayId: gw.gatewayId,
      gatewayArn: gw.gatewayArn,
      roleArn: gw.roleArn,
      targetIdV1: gw.targetId,
      onlineEvalArnV1: gw.onlineEvalArn,
      onlineEvalIdV1: gw.onlineEvalId,
    });
    onProgress("creating config-bundle A/B test");
    const ab = await api.abtestConfigBundle({
      name: names.bundleAbTest,
      gatewayArn: gw.gatewayArn,
      roleArn: gw.roleArn,
      onlineEvalArn: gw.onlineEvalArn,
      controlBundleArn: a.controlBundleId,
      controlVersion: a.controlBundleVersion,
      treatmentBundleArn: a.treatmentBundleId,
      treatmentVersion: a.treatmentBundleVersion,
      creds,
    });
    await putArtifacts(ctx, { bundleAbTestId: ab.abTestId });
    return ab;
  };

  const sendTraffic = async (onProgress: (m: string) => void) => {
    const dataset = datasets.data?.datasets.find((d) => d.id === effectiveDatasetId);
    if (!dataset) throw new Error(t.console.experiments.abtest.noDatasets);
    const { jobId } = await api.gatewayTraffic({
      gatewayId: a.gatewayId,
      targetName: a.targetNameV1,
      prompts: legacyItems(dataset).map((i) => ({ prompt: i.prompt, context: i.context })),
      creds,
    });
    await putArtifacts(ctx, { gwTrafficJobId: jobId, gwTrafficDatasetId: dataset.id });
    const result = await api.pollJob<{ count: number }>(jobId, {
      onProgress: (s) => s.progress && onProgress(s.progress),
    });
    await putArtifacts(ctx, { gwTrafficCount: result.count }, "monitor");
    return result;
  };

  const monitor = async (onProgress: (m: string) => void) => {
    const { metrics, analysisTimestamp } = await monitorAbTest(api, a.bundleAbTestId!, onProgress);
    await putArtifacts(ctx, { bundleMetrics: metrics, bundleAnalysisAt: analysisTimestamp });
    return metrics;
  };

  const promote = async (onProgress: (m: string) => void) => {
    onProgress("promoting treatment config to control bundle");
    const res = await api.updateBundle(a.controlBundleId!, {
      agentArn: agent.deployment?.runtimeArn,
      systemPrompt: a.acceptedSystemPrompt ?? "",
      toolDescriptions: a.acceptedToolDescriptions ?? {},
      parentVersionIds: [a.controlBundleVersion],
      commitMessage: "Promote treatment (A/B validated)",
      creds,
    });
    await putArtifacts(ctx, { promotedVersionId: res.versionId }, "promoted");
    return res;
  };

  const metrics = a.bundleMetrics;
  const verdict = metrics ? promoteVerdict(metrics) : null;
  const selectCls =
    "w-full rounded-md border border-line bg-ink-900/60 px-3 py-2 text-sm text-fog-100 outline-none focus:border-cyan/60";
  const active = exp.stage === "abtest" || exp.stage === "monitor";

  return (
    <Card eyebrow={t.console.experiments.stages.abtest} title={t.console.experiments.abtest.setupTitle} accent={active ? "orange" : "none"}>
      {/* ① Setup */}
      {a.bundleAbTestId ? (
        <div className="font-mono text-[11px] text-fog-500">
          gw {a.gatewayId} · target {a.targetNameV1} · A/B {a.bundleAbTestId}
        </div>
      ) : (
        <LiveRunButton label={t.console.experiments.abtest.setupBtn} doneLabel="✓" run={setup} />
      )}

      {/* ② Traffic */}
      {a.bundleAbTestId && (
        <div className="mt-4 border-t border-line/60 pt-4">
          <span className="eyebrow mb-2 block">{t.console.experiments.abtest.trafficTitle}</span>
          <div className="grid gap-3 sm:grid-cols-[280px_auto]">
            <select value={effectiveDatasetId} onChange={(e) => setDatasetId(e.target.value)} className={selectCls}>
              {(datasets.data?.datasets ?? []).length === 0 && <option value="">—</option>}
              {datasets.data?.datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({t.console.datasets.itemCount(d.items.length)})
                </option>
              ))}
            </select>
            <LiveRunButton
              label={t.console.experiments.abtest.sendBtn}
              doneLabel={`✓ ${a.gwTrafficCount ?? ""}`}
              variant="secondary"
              run={sendTraffic}
            />
          </div>
          {(datasets.data?.datasets ?? []).length === 0 && !datasets.loading && (
            <p className="mt-1 text-[11px] text-warn">{t.console.experiments.abtest.noDatasets}</p>
          )}
        </div>
      )}

      {/* ③ Monitor */}
      {(a.gwTrafficCount !== undefined || metrics) && (
        <div className="mt-4 border-t border-line/60 pt-4">
          <span className="eyebrow mb-2 block">{t.console.experiments.abtest.monitorTitle}</span>
          <p className="mb-2 text-[11px] text-fog-500">{t.console.experiments.abtest.aggregationHint}</p>
          {!metrics && (
            <LiveRunButton label={t.console.experiments.abtest.monitorBtn} doneLabel="✓" run={monitor} />
          )}
          {metrics && (
            <LazyABChart
              metrics={metrics}
              controlLabel={t.console.experiments.abtest.controlLabel}
              treatmentLabel={t.console.experiments.abtest.treatmentLabel}
            />
          )}
          {verdict && (
            <div
              className={`mt-3 rounded-md border px-3 py-2 text-xs ${
                verdict.status === "win"
                  ? "border-ok/40 bg-ok/10 text-ok"
                  : verdict.status === "loss"
                    ? "border-danger/40 bg-danger/10 text-danger"
                    : "border-warn/40 bg-warn/10 text-warn"
              }`}
            >
              {verdictSentence(verdict, t)}
            </div>
          )}
        </div>
      )}

      {/* ④ Promote */}
      {metrics && (
        <div className="mt-4 border-t border-line/60 pt-4">
          <span className="eyebrow mb-2 block">{t.console.experiments.abtest.promoteTitle}</span>
          {a.promotedVersionId ? (
            <Badge variant="ok" dot mono>
              {t.console.experiments.abtest.promoted} @ {a.promotedVersionId}
            </Badge>
          ) : (
            <LiveRunButton
              label={t.console.experiments.abtest.promoteBtn}
              doneLabel={t.console.experiments.abtest.promoted}
              run={promote}
            />
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Stage 4: Target-routing canary ─────────────────────────────────────────
function CanaryStage({ ctx }: { ctx: StageContext }) {
  const { t } = useLang();
  const { api, creds, exp } = ctx;
  const a = exp.artifacts;
  const agents = useResource(() => api.listAgents(), []);
  const datasets = useResource(() => api.listDatasets(), []);
  const [challengerId, setChallengerId] = useState("");
  const [datasetId, setDatasetId] = useState("");
  const [weight, setWeight] = useState(a.weights?.treatment ?? 10);
  const [error, setError] = useState<string | null>(null);

  const challengers = (agents.data?.agents ?? []).filter(
    (x) => x.deployment?.status === "deployed" && x.id !== exp.agentId,
  );
  const effectiveChallengerId = exp.challengerAgentId ?? challengerId ?? "";
  const effectiveDatasetId =
    datasetId || a.targetTrafficDatasetId || datasets.data?.datasets[0]?.id || "";
  const names = experimentNames(exp.id, exp.agentName, exp.challengerAgentName ?? undefined);

  const pickChallenger = async (id: string) => {
    setChallengerId(id);
    if (!id) return;
    try {
      await api.updateExperiment(exp.id, { challengerAgentId: id });
      ctx.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const setup = async (onProgress: (m: string) => void) => {
    const challenger = await api.getAgent(exp.challengerAgentId!);
    const cd = challenger.deployment;
    const { jobId } = await api.abtestTargetSetup({
      name: names.targetAbTest,
      gatewayId: a.gatewayId,
      gatewayArn: a.gatewayArn,
      roleArn: a.roleArn,
      agentArnV2: cd?.runtimeArn,
      targetNameV1: a.targetNameV1,
      targetNameV2: names.targetV2,
      onlineEvalNameV2: names.onlineEvalV2,
      logGroupV2: cd?.logGroup,
      serviceNameV2: cd?.serviceName,
      onlineEvalArnV1: a.onlineEvalArnV1,
      bundleAbTestId: a.bundleAbTestId,
      creds,
    });
    await putArtifacts(ctx, { targetSetupJobId: jobId, targetNameV2: names.targetV2 });
    const result = await api.pollJob<{
      targetIdV2: string;
      onlineEvalArnV2: string;
      onlineEvalIdV2: string;
      abTestId: string;
    }>(jobId, { onProgress: (s) => s.progress && onProgress(s.progress) });
    await putArtifacts(
      ctx,
      {
        targetIdV2: result.targetIdV2,
        onlineEvalArnV2: result.onlineEvalArnV2,
        onlineEvalIdV2: result.onlineEvalIdV2,
        targetAbTestId: result.abTestId,
        weights: { control: 90, treatment: 10 },
      },
      "canary",
    );
    return result;
  };

  const sendTraffic = async (onProgress: (m: string) => void) => {
    const dataset = datasets.data?.datasets.find((d) => d.id === effectiveDatasetId);
    if (!dataset) throw new Error(t.console.experiments.abtest.noDatasets);
    const { jobId } = await api.gatewayTraffic({
      gatewayId: a.gatewayId,
      targetName: a.targetNameV2,
      prompts: legacyItems(dataset).map((i) => ({ prompt: i.prompt, context: i.context })),
      creds,
    });
    await putArtifacts(ctx, { targetTrafficJobId: jobId, targetTrafficDatasetId: dataset.id });
    const result = await api.pollJob<{ count: number }>(jobId, {
      onProgress: (s) => s.progress && onProgress(s.progress),
    });
    await putArtifacts(ctx, { targetTrafficCount: result.count }, "canary_monitor");
    return result;
  };

  const monitor = async (onProgress: (m: string) => void) => {
    const { metrics, analysisTimestamp } = await monitorAbTest(api, a.targetAbTestId!, onProgress);
    await putArtifacts(ctx, { targetMetrics: metrics, targetAnalysisAt: analysisTimestamp });
    return metrics;
  };

  const shiftWeight = async (w: number) => {
    setError(null);
    try {
      await api.setWeights(a.targetAbTestId!, {
        controlWeight: 100 - w,
        treatmentWeight: w,
        variants: [
          { name: "C", weight: 100 - w, variantConfiguration: { target: { name: a.targetNameV1 } } },
          { name: "T1", weight: w, variantConfiguration: { target: { name: a.targetNameV2 } } },
        ],
        creds,
      });
      setWeight(w);
      await putArtifacts(ctx, { weights: { control: 100 - w, treatment: w } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const finish = async () => {
    await api.updateExperiment(exp.id, { stage: "done" });
    ctx.reload();
  };

  const selectCls =
    "w-full rounded-md border border-line bg-ink-900/60 px-3 py-2 text-sm text-fog-100 outline-none focus:border-cyan/60";
  const active = exp.stage === "promoted" || exp.stage === "canary" || exp.stage === "canary_monitor";
  const { dispatch } = useConsole();

  return (
    <Card eyebrow={t.console.experiments.stages.canary} title={t.console.experiments.canary.title} accent={active ? "orange" : "none"}>
      {error && (
        <div role="alert" className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      {/* Challenger picker */}
      {!a.targetAbTestId && (
        <div className="grid gap-3 sm:grid-cols-[280px_auto]">
          <label className="block">
            <span className="eyebrow mb-1 block">{t.console.experiments.canary.pickChallenger}</span>
            <select
              value={effectiveChallengerId}
              onChange={(e) => void pickChallenger(e.target.value)}
              className={selectCls}
            >
              <option value="">—</option>
              {challengers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {challengers.length === 0 && !agents.loading && (
              <span className="mt-1 block text-[11px] text-warn">{t.console.experiments.canary.noChallenger}</span>
            )}
          </label>
          <div className="self-end">
            {exp.challengerAgentId && (
              <LiveRunButton label={t.console.experiments.canary.setupBtn} doneLabel="✓" run={setup} />
            )}
          </div>
        </div>
      )}

      {a.targetAbTestId && (
        <>
          <div className="font-mono text-[11px] text-fog-500">
            challenger {exp.challengerAgentName} · target {a.targetNameV2} · A/B {a.targetAbTestId}
          </div>

          {/* Traffic */}
          <div className="mt-4 border-t border-line/60 pt-4">
            <span className="eyebrow mb-2 block">{t.console.experiments.canary.trafficTitle}</span>
            <div className="grid gap-3 sm:grid-cols-[280px_auto]">
              <select value={effectiveDatasetId} onChange={(e) => setDatasetId(e.target.value)} className={selectCls}>
                {datasets.data?.datasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({t.console.datasets.itemCount(d.items.length)})
                  </option>
                ))}
              </select>
              <LiveRunButton
                label={t.console.experiments.abtest.sendBtn}
                doneLabel={`✓ ${a.targetTrafficCount ?? ""}`}
                variant="secondary"
                run={sendTraffic}
              />
            </div>
          </div>

          {/* Monitor */}
          {(a.targetTrafficCount !== undefined || a.targetMetrics) && (
            <div className="mt-4 border-t border-line/60 pt-4">
              <span className="eyebrow mb-2 block">{t.console.experiments.canary.monitorTitle}</span>
              <p className="mb-2 text-[11px] text-fog-500">{t.console.experiments.abtest.aggregationHint}</p>
              {!a.targetMetrics && (
                <LiveRunButton label={t.console.experiments.abtest.monitorBtn} doneLabel="✓" run={monitor} />
              )}
              {a.targetMetrics && (
                <LazyABChart
                  metrics={a.targetMetrics}
                  controlLabel={t.console.experiments.canary.v1Label}
                  treatmentLabel={t.console.experiments.canary.v2Label}
                />
              )}
            </div>
          )}

          {/* Weights */}
          {a.targetMetrics && (
            <div className="mt-4 border-t border-line/60 pt-4">
              <span className="eyebrow mb-2 block">{t.console.experiments.canary.weightsTitle}</span>
              <p className="mb-2 text-[11px] text-fog-500">{t.console.experiments.canary.rolloutHint}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="cyan" mono>
                  {t.console.experiments.canary.currentWeight(weight)}
                </Badge>
                {[10, 50, 100]
                  .filter((w) => w !== weight)
                  .map((w) => (
                    <Button key={w} size="sm" variant="secondary" onClick={() => void shiftWeight(w)}>
                      {t.console.experiments.canary.setWeight(w)}
                    </Button>
                  ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Finish */}
      {exp.stage !== "done" && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line/60 pt-4">
          <Button variant="secondary" size="sm" onClick={() => void finish()}>
            {a.targetAbTestId ? t.console.experiments.doneTitle : t.console.experiments.canary.skipBtn}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dispatch({ type: "GO_SECTION", section: "cleanup" })}
          >
            {t.console.experiments.goCleanup}
          </Button>
        </div>
      )}
    </Card>
  );
}
