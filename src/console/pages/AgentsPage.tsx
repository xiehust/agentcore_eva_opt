import { useRef, useState } from "react";
import { Badge, Button, Card } from "../../components/ui";
import { LiveRunButton } from "../../components/LiveRunButton";
import { useLiveApi } from "../../lib/useLiveApi";
import { useResource } from "../../lib/useResource";
import { useConsole } from "../../state/console";
import { useLang } from "../../i18n/lang";
import type { AgentConfig, AgentRecord } from "../../lib/liveApi";
import { LazyCodeEditor } from "../LazyCodeEditor";
import { RegisterExternalForm } from "./RegisterExternalForm";
import { TelemetryCheckPanel } from "./TelemetryCheckPanel";

const BASE_DEPS = ["strands-agents[otel]", "bedrock-agentcore", "aws-opentelemetry-distro"];

const BLANK_TEMPLATE = `"""Minimal AgentCore runtime agent (Strands) with config-bundle support."""
from bedrock_agentcore.runtime import BedrockAgentCoreApp, BedrockAgentCoreContext
from strands import Agent
from strands.models import BedrockModel

app = BedrockAgentCoreApp()
_MODEL = BedrockModel(model_id="nvidia.nemotron-nano-3-30b")
DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant."


@app.entrypoint
async def invoke(payload, context):
    # Config bundles (experiments) override the prompt at invoke time.
    bundle = BedrockAgentCoreContext.get_config_bundle()
    system_prompt = DEFAULT_SYSTEM_PROMPT
    if bundle:
        system_prompt = bundle.get("system_prompt", DEFAULT_SYSTEM_PROMPT)
    agent = Agent(model=_MODEL, system_prompt=system_prompt)
    result = await agent.invoke_async(payload.get("prompt", ""))
    return str(result)


if __name__ == "__main__":
    app.run()
`;

/** Agents: list, create (blank / sample / upload), edit code, deploy/undeploy. */
export function AgentsPage() {
  const { state, dispatch } = useConsole();
  if (state.editingAgentId) {
    return <AgentEditor agentId={state.editingAgentId} onClose={() => dispatch({ type: "EDIT_AGENT", agentId: undefined })} />;
  }
  return <AgentList />;
}

function deployBadge(agent: AgentRecord, t: ReturnType<typeof useLang>["t"]) {
  if (agent.kind === "external") {
    return <Badge variant="cyan" mono>{t.console.agents.externalBadge}</Badge>;
  }
  const status = agent.deployment?.status;
  if (status === "deployed") return <Badge variant="ok" dot mono>{t.console.agents.deployed}</Badge>;
  if (status === "deploying") return <Badge variant="warn" dot pulse mono>{t.console.agents.deploying}</Badge>;
  if (status === "failed") return <Badge variant="danger" dot mono>{t.console.agents.deployFailed}</Badge>;
  return <Badge variant="neutral" mono>{t.console.agents.notDeployed}</Badge>;
}

function AgentList() {
  const { api } = useLiveApi();
  const { dispatch } = useConsole();
  const { t } = useLang();
  const agents = useResource(() => api.listAgents(), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [editingExternal, setEditingExternal] = useState<string | null>(null);

  const createFrom = async (
    fn: () => Promise<{
      name: string;
      description?: string;
      code: string;
      requirements?: string[];
      config?: AgentConfig | null;
    }>,
  ) => {
    setBusy(true);
    setError(null);
    try {
      const draft = await fn();
      const created = await api.createAgent(draft);
      dispatch({ type: "EDIT_AGENT", agentId: created.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onUpload = (file: File) => {
    void createFrom(async () => ({
      name: file.name.replace(/\.py$/, ""),
      code: await file.text(),
    }));
  };

  if (registering) {
    return (
      <RegisterExternalForm
        onDone={() => {
          setRegistering(false);
          agents.reload();
        }}
        onCancel={() => setRegistering(false)}
      />
    );
  }
  const externalBeingEdited = agents.data?.agents.find((a) => a.id === editingExternal);
  if (externalBeingEdited) {
    return (
      <RegisterExternalForm
        agent={externalBeingEdited}
        onDone={() => {
          setEditingExternal(null);
          agents.reload();
        }}
        onCancel={() => setEditingExternal(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card
        eyebrow={t.console.agents.eyebrow}
        title={t.console.agents.title}
        accent="orange"
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void createFrom(async () => api.sampleAgent())}>
              {t.console.agents.newFromSample}
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void createFrom(async () => api.sampleAgent("v2"))}>
              {t.console.agents.newFromSampleV2}
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void createFrom(async () => api.sampleAgent("zh"))}>
              {t.console.agents.newFromSampleZh}
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void createFrom(async () => ({ name: "New Agent", code: BLANK_TEMPLATE }))}>
              {t.console.agents.newBlank}
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => fileInput.current?.click()}>
              {t.console.agents.uploadPy}
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => setRegistering(true)}>
              {t.console.agents.registerExternal}
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".py"
              className="hidden"
              data-testid="agent-upload"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
                e.target.value = "";
              }}
            />
          </div>
        }
      >
        {error && (
          <div role="alert" className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </div>
        )}
        {agents.loading && <p className="text-sm text-fog-500">{t.console.common.loading}</p>}
        {agents.error && <p className="text-sm text-danger">{agents.error}</p>}
        {agents.data && agents.data.agents.length === 0 && (
          <p className="text-sm text-fog-400">{t.console.agents.empty}</p>
        )}
        <ul className="space-y-3">
          {agents.data?.agents.map((agent) => (
            <li key={agent.id} className="rounded-md border border-line bg-ink-750/60 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-sm font-semibold text-fog-100">{agent.name}</span>
                    {deployBadge(agent, t)}
                    {agent.kind === "external" && agent.binding?.invoke?.url && (
                      <Badge variant="ok" mono>{t.console.agents.invoke.invokableBadge}</Badge>
                    )}
                  </div>
                  {agent.description && (
                    <p className="mt-0.5 truncate text-xs text-fog-400">{agent.description}</p>
                  )}
                  {agent.kind === "external" && agent.binding && (
                    <p className="mt-1 truncate font-mono text-[11px] text-fog-500">
                      {agent.binding.serviceName} · {agent.binding.logGroup}
                    </p>
                  )}
                  {agent.deployment?.status === "deployed" && agent.deployment.runtimeArn && (
                    <p className="mt-1 truncate font-mono text-[11px] text-fog-500">{agent.deployment.runtimeArn}</p>
                  )}
                  {agent.deployment?.status === "failed" && agent.deployment.error && (
                    <p className="mt-1 truncate font-mono text-[11px] text-danger">{agent.deployment.error}</p>
                  )}
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      agent.kind === "external"
                        ? setEditingExternal(agent.id)
                        : dispatch({ type: "EDIT_AGENT", agentId: agent.id })
                    }
                  >
                    {t.console.common.edit}
                  </Button>
                  {(agent.deployment?.status === "deployed" || agent.kind === "external") && (
                    <Button size="sm" variant="secondary" onClick={() => dispatch({ type: "START_RUN_WITH", agentId: agent.id })}>
                      {t.console.agents.runWithAgent}
                    </Button>
                  )}
                  {confirmId === agent.id ? (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        setConfirmId(null);
                        void api.deleteAgent(agent.id).then(agents.reload).catch((e: unknown) =>
                          setError(e instanceof Error ? e.message : String(e)),
                        );
                      }}
                    >
                      {t.console.common.confirmDelete}
                    </Button>
                  ) : (
                    <Button size="sm" variant="danger" onClick={() => setConfirmId(agent.id)}>
                      {t.console.common.delete}
                    </Button>
                  )}
                </div>
              </div>
              <div className="mt-2.5 border-t border-line/60 pt-2.5">
                {agent.kind === "external" ? (
                  <p className="text-[11px] leading-relaxed text-fog-500">
                    {t.console.agents.externalNoDeploy}
                  </p>
                ) : (
                  <AgentDeployControls agent={agent} onDone={agents.reload} />
                )}
                {(agent.kind === "external" || agent.deployment?.status === "deployed") && (
                  <TelemetryCheckPanel agentId={agent.id} />
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function AgentDeployControls({ agent, onDone }: { agent: AgentRecord; onDone: () => void }) {
  const { api, creds } = useLiveApi();
  const { t } = useLang();
  const deployed = agent.deployment?.status === "deployed";

  if (deployed) {
    return (
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <span className="font-mono text-[11px] text-fog-500">
          {t.console.agents.serviceName}: {agent.deployment?.serviceName}
        </span>
        <span className="font-mono text-[11px] text-fog-500">
          {t.console.agents.region}: {agent.deployment?.region}
        </span>
        <span className="ml-auto">
          <LiveRunButton
            label={t.console.agents.undeploy}
            doneLabel={t.console.agents.notDeployed}
            variant="secondary"
            run={async (onProgress) => {
              const { jobId } = await api.undeployAgent(agent.id, { creds: creds ?? null });
              return api.pollJob(jobId, { onProgress: (s) => s.progress && onProgress(s.progress) });
            }}
            onComplete={onDone}
          />
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <LiveRunButton
        label={t.console.agents.deploy}
        doneLabel={t.console.agents.deployed}
        run={async (onProgress) => {
          const { jobId } = await api.deployAgent(agent.id, { creds: creds ?? null });
          return api.pollJob(jobId, { onProgress: (s) => s.progress && onProgress(s.progress) });
        }}
        onComplete={onDone}
      />
      <p className="text-[11px] leading-relaxed text-fog-500">{t.console.agents.deployHint}</p>
    </div>
  );
}

interface AgentDraft {
  name: string;
  description: string;
  code: string;
  requirements: string;
  systemPrompt: string;
  tools: { name: string; description: string }[];
}

function AgentEditor({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const { api } = useLiveApi();
  const { t } = useLang();
  const agent = useResource(() => api.getAgent(agentId), [agentId]);
  const [draft, setDraft] = useState<AgentDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Initialize the draft once the record arrives.
  if (agent.data && draft === null) {
    setDraft({
      name: agent.data.name,
      description: agent.data.description,
      code: agent.data.code ?? "",
      requirements: agent.data.requirements.join("\n"),
      systemPrompt: agent.data.config?.systemPrompt ?? "",
      tools: Object.entries(agent.data.config?.toolDescriptions ?? {}).map(
        ([name, description]) => ({ name, description }),
      ),
    });
  }

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) return setError(t.console.agents.nameRequired);
    if (!draft.code.trim()) return setError(t.console.agents.codeRequired);
    setSaving(true);
    setError(null);
    try {
      const toolDescriptions = Object.fromEntries(
        draft.tools
          .filter((tool) => tool.name.trim() !== "")
          .map((tool) => [tool.name.trim(), tool.description]),
      );
      await api.updateAgent(agentId, {
        name: draft.name.trim(),
        description: draft.description,
        code: draft.code,
        requirements: draft.requirements.split("\n").map((r) => r.trim()).filter(Boolean),
        config: { systemPrompt: draft.systemPrompt, toolDescriptions },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const setTool = (index: number, patch: Partial<{ name: string; description: string }>) => {
    if (!draft) return;
    setDraft({
      ...draft,
      tools: draft.tools.map((tool, i) => (i === index ? { ...tool, ...patch } : tool)),
    });
  };

  return (
    <Card
      eyebrow={t.console.agents.eyebrow}
      title={draft?.name ?? t.console.common.loading}
      accent="orange"
      action={
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t.console.common.back}
          </Button>
          <Button size="sm" disabled={saving || !draft} onClick={() => void save()}>
            {saved ? `${t.console.common.save} ✓` : t.console.common.save}
          </Button>
        </div>
      }
    >
      {agent.loading && <p className="text-sm text-fog-500">{t.console.common.loading}</p>}
      {agent.error && <p className="text-sm text-danger">{agent.error}</p>}
      {error && (
        <div role="alert" className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}
      {draft && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="eyebrow mb-1 block">{t.console.common.name}</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="w-full rounded-md border border-line bg-ink-900/60 px-3 py-2 text-sm text-fog-100 outline-none focus:border-cyan/60"
              />
            </label>
            <label className="block">
              <span className="eyebrow mb-1 block">{t.console.common.description}</span>
              <input
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                className="w-full rounded-md border border-line bg-ink-900/60 px-3 py-2 text-sm text-fog-100 outline-none focus:border-cyan/60"
              />
            </label>
          </div>

          <div>
            <span className="eyebrow mb-1 block">{t.console.agents.baseDeps}</span>
            <div className="flex flex-wrap gap-1.5">
              {BASE_DEPS.map((d) => (
                <Badge key={d} variant="neutral" mono>
                  {d}
                </Badge>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="eyebrow mb-1 block">{t.console.agents.requirements}</span>
            <textarea
              value={draft.requirements}
              onChange={(e) => setDraft({ ...draft, requirements: e.target.value })}
              rows={2}
              spellCheck={false}
              className="w-full rounded-md border border-line bg-ink-900/60 px-3 py-2 font-mono text-xs text-fog-100 outline-none focus:border-cyan/60"
            />
            <span className="mt-1 block text-[11px] text-fog-500">{t.console.agents.requirementsHint}</span>
          </label>

          <div className="rounded-md border border-line bg-ink-900/30 px-4 py-3">
            <span className="eyebrow mb-2 block">{t.console.agentConfig.eyebrow}</span>
            <p className="mb-3 text-[11px] leading-relaxed text-fog-500">{t.console.agentConfig.hint}</p>
            <label className="block">
              <span className="eyebrow mb-1 block">{t.console.agentConfig.systemPrompt}</span>
              <textarea
                value={draft.systemPrompt}
                onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })}
                rows={5}
                data-testid="config-system-prompt"
                className="w-full rounded-md border border-line bg-ink-900/60 px-3 py-2 font-mono text-xs text-fog-100 outline-none focus:border-cyan/60"
              />
            </label>
            <div className="mt-3">
              <span className="eyebrow mb-1 block">{t.console.agentConfig.toolDescriptions}</span>
              <div className="space-y-2">
                {draft.tools.map((tool, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-[200px_minmax(0,1fr)_auto]">
                    <input
                      value={tool.name}
                      placeholder={t.console.agentConfig.toolName}
                      onChange={(e) => setTool(i, { name: e.target.value })}
                      className="rounded-md border border-line bg-ink-900/60 px-3 py-2 font-mono text-xs text-fog-100 outline-none placeholder:text-fog-600 focus:border-cyan/60"
                    />
                    <input
                      value={tool.description}
                      placeholder={t.console.agentConfig.toolDesc}
                      onChange={(e) => setTool(i, { description: e.target.value })}
                      className="rounded-md border border-line bg-ink-900/60 px-3 py-2 text-xs text-fog-100 outline-none placeholder:text-fog-600 focus:border-cyan/60"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDraft({ ...draft, tools: draft.tools.filter((_, j) => j !== i) })}
                    >
                      {t.console.agentConfig.removeTool}
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2"
                onClick={() => setDraft({ ...draft, tools: [...draft.tools, { name: "", description: "" }] })}
              >
                {t.console.agentConfig.addTool}
              </Button>
            </div>
          </div>

          <div>
            <span className="eyebrow mb-1 block">{t.console.agents.code}</span>
            <LazyCodeEditor value={draft.code} onChange={(code) => setDraft({ ...draft, code })} />
          </div>
        </div>
      )}
    </Card>
  );
}
