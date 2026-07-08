import { useRef, useState } from "react";
import { Badge, Button, Card } from "../../components/ui";
import { useLiveApi } from "../../lib/useLiveApi";
import { useResource } from "../../lib/useResource";
import { useConsole } from "../../state/console";
import { useLang } from "../../i18n/lang";
import { parseDatasetFile, serializeDataset } from "../../lib/datasetIo";
import { validateScenarioJson } from "../../lib/scenarioValidation";
import { legacyItems, type DatasetItem, type DatasetKind, type DatasetRecord, type Scenario } from "../../lib/liveApi";
import type { LiveApi } from "../../lib/liveApi";

/** Datasets: list, create (blank / sample / upload / scenario JSON), edit,
 *  and the AWS Dataset resource lifecycle (sync / list / delete). */
export function DatasetsPage() {
  const { state, dispatch } = useConsole();
  if (state.editingDatasetId) {
    return (
      <DatasetEditor
        datasetId={state.editingDatasetId}
        onClose={() => dispatch({ type: "EDIT_DATASET", datasetId: undefined })}
      />
    );
  }
  return <DatasetList />;
}

const KIND_BADGE: Record<DatasetKind, "neutral" | "cyan" | "orange"> = {
  legacy: "neutral",
  predefined: "cyan",
  simulated: "orange",
};

function KindBadge({ kind }: { kind: DatasetKind }) {
  const { t } = useLang();
  return (
    <Badge variant={KIND_BADGE[kind]} mono className="text-[10px]">
      {t.console.datasets.kinds[kind]}
    </Badge>
  );
}

function scenarioCount(ds: Pick<DatasetRecord, "items" | "kind">): { scenarios: number; turns: number } {
  if (ds.kind === "predefined") {
    const scenarios = ds.items as Scenario[];
    return { scenarios: scenarios.length, turns: scenarios.reduce((n, s) => n + (s.turns?.length ?? 0), 0) };
  }
  return { scenarios: ds.items.length, turns: ds.items.length };
}

function DatasetList() {
  const { api } = useLiveApi();
  const { dispatch } = useConsole();
  const { t } = useLang();
  const datasets = useResource(() => api.listDatasets(), []);
  const samples = useResource(() => api.sampleDatasets(), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [scenarioDraft, setScenarioDraft] = useState<{ kind: Exclude<DatasetKind, "legacy">; name: string; json: string } | null>(null);
  const [scenarioError, setScenarioError] = useState<string | null>(null);

  const createFrom = async (
    fn: () => Promise<{ name: string; description?: string; kind?: DatasetKind; items?: DatasetItem[]; scenarios?: Scenario[] }>,
  ) => {
    setBusy(true);
    setError(null);
    try {
      const draft = await fn();
      const created = await api.createDataset(draft);
      dispatch({ type: "EDIT_DATASET", datasetId: created.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onUpload = (file: File) => {
    void createFrom(async () => {
      const text = await file.text();
      try {
        return { name: file.name.replace(/\.(json|jsonl)$/, ""), items: parseDatasetFile(text) };
      } catch (e) {
        throw new Error(t.console.datasets.invalidFile(e instanceof Error ? e.message : String(e)));
      }
    });
  };

  const openScenarioDraft = (kind: Exclude<DatasetKind, "legacy">) => {
    const sample = (samples.data?.datasets ?? []).find((s) => s.kind === kind);
    setScenarioError(null);
    setScenarioDraft({
      kind,
      name: kind === "predefined" ? t.console.datasets.newScenarioName : t.console.datasets.newSimulatedName,
      json: JSON.stringify(sample?.items ?? [], null, 2),
    });
  };

  const submitScenarioDraft = () => {
    if (!scenarioDraft) return;
    setScenarioError(null);
    let scenarios: Scenario[];
    try {
      scenarios = validateScenarioJson(scenarioDraft.kind, scenarioDraft.json);
    } catch (e) {
      setScenarioError(t.console.datasets.invalidScenarios(e instanceof Error ? e.message : String(e)));
      return;
    }
    void createFrom(async () => ({ name: scenarioDraft.name, kind: scenarioDraft.kind, scenarios }));
    setScenarioDraft(null);
  };

  return (
    <div className="space-y-4">
      <Card
        eyebrow={t.console.datasets.eyebrow}
        title={t.console.datasets.title}
        accent="cyan"
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void createFrom(async () => ({ name: "New Dataset", items: [{ prompt: "" }] }))}
            >
              {t.console.datasets.newBlank}
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => openScenarioDraft("predefined")}>
              {t.console.datasets.newScenario}
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => openScenarioDraft("simulated")}>
              {t.console.datasets.newSimulated}
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => fileInput.current?.click()}>
              {t.console.datasets.upload}
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,.jsonl"
              className="hidden"
              data-testid="dataset-upload"
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
        {scenarioDraft && (
          <div className="mb-4 rounded-md border border-cyan/30 bg-ink-750/60 p-4" data-testid="scenario-draft">
            <div className="mb-2 flex items-center gap-2">
              <span className="eyebrow">{t.console.datasets.scenarioDraftTitle}</span>
              <KindBadge kind={scenarioDraft.kind} />
            </div>
            <input
              value={scenarioDraft.name}
              onChange={(e) => setScenarioDraft({ ...scenarioDraft, name: e.target.value })}
              className="mb-2 w-full rounded-md border border-line bg-ink-900/60 px-3 py-2 text-sm text-fog-100 outline-none focus:border-cyan/60"
            />
            <textarea
              value={scenarioDraft.json}
              rows={14}
              spellCheck={false}
              data-testid="scenario-json"
              onChange={(e) => setScenarioDraft({ ...scenarioDraft, json: e.target.value })}
              className="w-full rounded-md border border-line bg-ink-900/80 px-3 py-2 font-mono text-xs leading-relaxed text-fog-100 outline-none focus:border-cyan/60"
            />
            <p className="mt-1 text-[11px] text-fog-500">
              {scenarioDraft.kind === "predefined"
                ? t.console.datasets.scenarioSchemaHint
                : t.console.datasets.simulatedSchemaHint}
            </p>
            {scenarioError && (
              <div role="alert" className="mt-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                {scenarioError}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={submitScenarioDraft} disabled={busy}>
                {t.console.datasets.createScenarioDataset}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setScenarioDraft(null)}>
                {t.console.common.cancel}
              </Button>
            </div>
          </div>
        )}
        {/* Sample gallery: built-in sets (en + zh + scenario kinds). */}
        <div className="mb-3">
          <span className="eyebrow mb-1.5 block">{t.console.datasets.newFromSample}</span>
          <div className="flex flex-wrap gap-2">
            {(samples.data?.datasets ?? []).map((s) => (
              <Button
                key={s.key}
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void createFrom(async () =>
                    s.kind && s.kind !== "legacy"
                      ? { name: s.name, description: s.description, kind: s.kind, scenarios: s.items as unknown as Scenario[] }
                      : { name: s.name, description: s.description, items: s.items },
                  )
                }
              >
                {t.console.datasets.fromSample(s.name)}
              </Button>
            ))}
          </div>
        </div>
        <p className="mb-3 text-[11px] text-fog-500">{t.console.datasets.formatHint}</p>
        {datasets.loading && <p className="text-sm text-fog-500">{t.console.common.loading}</p>}
        {datasets.error && <p className="text-sm text-danger">{datasets.error}</p>}
        {datasets.data && datasets.data.datasets.length === 0 && (
          <p className="text-sm text-fog-400">{t.console.datasets.empty}</p>
        )}
        <ul className="space-y-3">
          {datasets.data?.datasets.map((ds) => (
            <li key={ds.id} className="rounded-md border border-line bg-ink-750/60 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0">
                  <span className="font-display text-sm font-semibold text-fog-100">{ds.name}</span>
                  <KindBadge kind={ds.kind} />
                  <span className="ml-2 font-mono text-[11px] text-fog-500">
                    {ds.kind === "legacy"
                      ? t.console.datasets.itemCount(ds.items.length)
                      : t.console.datasets.scenarioCount(scenarioCount(ds).scenarios, scenarioCount(ds).turns)}
                  </span>
                  {ds.description && <p className="mt-0.5 truncate text-xs text-fog-400">{ds.description}</p>}
                </div>
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => dispatch({ type: "EDIT_DATASET", datasetId: ds.id })}>
                    {t.console.common.edit}
                  </Button>
                  {confirmId === ds.id ? (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        setConfirmId(null);
                        void api.deleteDataset(ds.id).then(datasets.reload).catch((e: unknown) =>
                          setError(e instanceof Error ? e.message : String(e)),
                        );
                      }}
                    >
                      {t.console.common.confirmDelete}
                    </Button>
                  ) : (
                    <Button size="sm" variant="danger" onClick={() => setConfirmId(ds.id)}>
                      {t.console.common.delete}
                    </Button>
                  )}
                </div>
              </div>
              <CloudSyncRow dataset={ds} api={api} onSynced={datasets.reload} />
            </li>
          ))}
        </ul>
      </Card>

      <CloudDatasetsCard />
    </div>
  );
}

/** Per-dataset AWS sync block: sync button → job progress → cloud info. */
function CloudSyncRow({ dataset, api, onSynced }: { dataset: DatasetRecord; api: LiveApi; onSynced: () => void }) {
  const { t } = useLang();
  const { creds } = useLiveApi();
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cloud = dataset.cloud;

  const sync = async () => {
    setError(null);
    setProgress(t.console.datasets.syncStarting);
    try {
      const { jobId } = await api.syncDatasetToAws(dataset.id, { creds });
      await api.pollJob(jobId, { onProgress: (s) => s.progress && setProgress(s.progress) });
      setProgress(null);
      onSynced();
    } catch (e) {
      setProgress(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line/50 pt-2">
      <span className="eyebrow">{t.console.datasets.cloudRowLabel}</span>
      {cloud && cloud.status !== "deleted" ? (
        <>
          <Badge variant={cloud.status === "ACTIVE" ? "ok" : "warn"} dot mono className="text-[10px]">
            {cloud.status}
          </Badge>
          <span className="font-mono text-[11px] text-fog-500">{cloud.datasetId}</span>
          {cloud.exampleCount != null && (
            <span className="font-mono text-[11px] text-fog-500">
              {t.console.datasets.cloudExampleCount(cloud.exampleCount)}
            </span>
          )}
        </>
      ) : (
        <span className="text-[11px] text-fog-500">{t.console.datasets.notSynced}</span>
      )}
      <div className="ml-auto">
        <Button size="sm" variant="secondary" disabled={progress != null} onClick={() => void sync()}>
          {progress != null ? t.console.datasets.syncing : t.console.datasets.syncToAws}
        </Button>
      </div>
      {progress && <p className="w-full font-mono text-[11px] text-cyan-soft">{progress}</p>}
      {error && (
        <p role="alert" className="w-full text-[11px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Account-level AWS Dataset resources (ListDatasets / DeleteDataset). */
function CloudDatasetsCard() {
  const { api, creds } = useLiveApi();
  const { t } = useLang();
  const [rows, setRows] = useState<Awaited<ReturnType<LiveApi["listCloudDatasets"]>>["datasets"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await api.listCloudDatasets({ creds });
      setRows(resp.datasets);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const remove = async (cloudId: string) => {
    setError(null);
    try {
      await api.deleteCloudDataset(cloudId);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Card
      eyebrow={t.console.datasets.cloudEyebrow}
      title={t.console.datasets.cloudTitle}
      accent="orange"
      action={
        <Button size="sm" variant="secondary" disabled={loading} onClick={() => void refresh()}>
          {loading ? t.console.common.loading : t.console.datasets.cloudRefresh}
        </Button>
      }
    >
      <p className="mb-3 text-[11px] text-fog-500">{t.console.datasets.cloudHint}</p>
      {error && (
        <div role="alert" className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}
      {rows === null && !loading && <p className="text-sm text-fog-400">{t.console.datasets.cloudNotLoaded}</p>}
      {rows !== null && rows.length === 0 && <p className="text-sm text-fog-400">{t.console.datasets.cloudEmpty}</p>}
      {rows !== null && rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.datasetId} className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-ink-750/60 px-4 py-2.5">
              <div className="min-w-0">
                <span className="font-display text-sm font-semibold text-fog-100">{row.name}</span>
                <span className="ml-2 font-mono text-[11px] text-fog-500">{row.datasetId}</span>
              </div>
              <Badge variant={row.status === "ACTIVE" ? "ok" : "warn"} dot mono className="text-[10px]">
                {row.status}
              </Badge>
              {row.schemaType && <span className="font-mono text-[10px] text-fog-500">{row.schemaType}</span>}
              {row.exampleCount != null && (
                <span className="font-mono text-[11px] text-fog-500">
                  {t.console.datasets.cloudExampleCount(row.exampleCount)}
                </span>
              )}
              <div className="ml-auto">
                {confirmId === row.datasetId ? (
                  <Button size="sm" variant="danger" onClick={() => { setConfirmId(null); void remove(row.datasetId); }}>
                    {t.console.common.confirmDelete}
                  </Button>
                ) : (
                  <Button size="sm" variant="danger" onClick={() => setConfirmId(row.datasetId)}>
                    {t.console.common.delete}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function DatasetEditor({ datasetId, onClose }: { datasetId: string; onClose: () => void }) {
  const { api } = useLiveApi();
  const { t } = useLang();
  const dataset = useResource(() => api.getDataset(datasetId), [datasetId]);
  const [draft, setDraft] = useState<{ name: string; description: string; items: DatasetItem[] } | null>(null);
  const [scenarioJson, setScenarioJson] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const kind: DatasetKind = dataset.data?.kind ?? "legacy";

  if (dataset.data && draft === null) {
    setDraft({
      name: dataset.data.name,
      description: dataset.data.description,
      items: legacyItems(dataset.data).map((i) => ({ ...i })),
    });
    if (dataset.data.kind !== "legacy") {
      setScenarioJson(JSON.stringify(dataset.data.items, null, 2));
    }
  }

  const setItem = (index: number, patch: Partial<DatasetItem>) => {
    if (!draft) return;
    const items = draft.items.map((item, i) => (i === index ? { ...item, ...patch } : item));
    setDraft({ ...draft, items });
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      if (kind !== "legacy") {
        let scenarios: Scenario[];
        try {
          scenarios = validateScenarioJson(kind, scenarioJson ?? "[]");
        } catch (e) {
          setError(t.console.datasets.invalidScenarios(e instanceof Error ? e.message : String(e)));
          return;
        }
        await api.updateDataset(datasetId, { name: draft.name.trim(), description: draft.description, scenarios });
      } else {
        const items = draft.items
          .map((i) => ({ prompt: i.prompt.trim(), ...(i.context?.trim() ? { context: i.context.trim() } : {}) }))
          .filter((i) => i.prompt !== "");
        if (items.length === 0) {
          setError(t.console.datasets.itemsRequired);
          return;
        }
        await api.updateDataset(datasetId, { name: draft.name.trim(), description: draft.description, items });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const download = () => {
    if (!draft) return;
    const payload = kind === "legacy" ? serializeDataset(draft.items) : (scenarioJson ?? "[]");
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${draft.name || "dataset"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card
      eyebrow={t.console.datasets.eyebrow}
      title={draft?.name ?? t.console.common.loading}
      accent="cyan"
      action={
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t.console.common.back}
          </Button>
          <Button size="sm" variant="secondary" onClick={download} disabled={!draft}>
            {t.console.datasets.download}
          </Button>
          <Button size="sm" disabled={saving || !draft} onClick={() => void save()}>
            {saved ? `${t.console.common.save} ✓` : t.console.common.save}
          </Button>
        </div>
      }
    >
      {dataset.loading && <p className="text-sm text-fog-500">{t.console.common.loading}</p>}
      {dataset.error && <p className="text-sm text-danger">{dataset.error}</p>}
      {error && (
        <div role="alert" className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}
      {draft && (
        <div className="space-y-4">
          {dataset.data && <KindBadge kind={kind} />}
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

          {kind !== "legacy" ? (
            <div>
              <span className="eyebrow mb-1 block">
                {kind === "predefined" ? t.console.datasets.scenarioJsonLabel : t.console.datasets.simulatedJsonLabel}
              </span>
              <textarea
                value={scenarioJson ?? ""}
                rows={18}
                spellCheck={false}
                data-testid="scenario-json"
                onChange={(e) => setScenarioJson(e.target.value)}
                className="w-full rounded-md border border-line bg-ink-900/80 px-3 py-2 font-mono text-xs leading-relaxed text-fog-100 outline-none focus:border-cyan/60"
              />
              <p className="mt-1 text-[11px] text-fog-500">
                {kind === "predefined" ? t.console.datasets.scenarioSchemaHint : t.console.datasets.simulatedSchemaHint}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line text-left">
                      <th className="w-8 px-2 py-2 font-mono text-[11px] font-normal text-fog-500">#</th>
                      <th className="w-64 px-2 py-2 font-mono text-[11px] font-normal text-fog-500">
                        {t.console.datasets.context}
                      </th>
                      <th className="px-2 py-2 font-mono text-[11px] font-normal text-fog-500">
                        {t.console.datasets.prompt}
                      </th>
                      <th className="w-20 px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {draft.items.map((item, i) => (
                      <tr key={i} className="border-b border-line/50 align-top">
                        <td className="px-2 py-2 font-mono text-[11px] text-fog-500">{i + 1}</td>
                        <td className="px-2 py-2">
                          <input
                            value={item.context ?? ""}
                            placeholder={t.console.datasets.contextHint}
                            onChange={(e) => setItem(i, { context: e.target.value })}
                            className="w-full rounded border border-line bg-ink-900/60 px-2 py-1.5 font-mono text-xs text-fog-100 outline-none placeholder:text-fog-600 focus:border-cyan/60"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <textarea
                            value={item.prompt}
                            rows={2}
                            onChange={(e) => setItem(i, { prompt: e.target.value })}
                            className="w-full rounded border border-line bg-ink-900/60 px-2 py-1.5 text-xs text-fog-100 outline-none focus:border-cyan/60"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) })}
                          >
                            {t.console.datasets.removeRow}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Button size="sm" variant="secondary" onClick={() => setDraft({ ...draft, items: [...draft.items, { prompt: "" }] })}>
                {t.console.datasets.addRow}
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
