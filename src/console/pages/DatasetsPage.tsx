import { useRef, useState } from "react";
import { Button, Card } from "../../components/ui";
import { useLiveApi } from "../../lib/useLiveApi";
import { useResource } from "../../lib/useResource";
import { useConsole } from "../../state/console";
import { useLang } from "../../i18n/lang";
import { parseDatasetFile, serializeDataset } from "../../lib/datasetIo";
import type { DatasetItem } from "../../lib/liveApi";

/** Datasets: list, create (blank / sample / upload), edit items in a table. */
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

  const createFrom = async (
    fn: () => Promise<{ name: string; description?: string; items: DatasetItem[] }>,
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

  return (
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
      {/* Sample gallery: 8 built-in sets (en + zh) — a wrapping row inside the
          body; the header action slot can't fit this many without overflow. */}
      <div className="mb-3">
        <span className="eyebrow mb-1.5 block">{t.console.datasets.newFromSample}</span>
        <div className="flex flex-wrap gap-2">
          {(samples.data?.datasets ?? []).map((s) => (
            <Button
              key={s.key}
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void createFrom(async () => ({ name: s.name, description: s.description, items: s.items }))}
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
          <li key={ds.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-ink-750/60 px-4 py-3">
            <div className="min-w-0">
              <span className="font-display text-sm font-semibold text-fog-100">{ds.name}</span>
              <span className="ml-2 font-mono text-[11px] text-fog-500">
                {t.console.datasets.itemCount(ds.items.length)}
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
          </li>
        ))}
      </ul>
    </Card>
  );
}

function DatasetEditor({ datasetId, onClose }: { datasetId: string; onClose: () => void }) {
  const { api } = useLiveApi();
  const { t } = useLang();
  const dataset = useResource(() => api.getDataset(datasetId), [datasetId]);
  const [draft, setDraft] = useState<{ name: string; description: string; items: DatasetItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (dataset.data && draft === null) {
    setDraft({
      name: dataset.data.name,
      description: dataset.data.description,
      items: dataset.data.items.map((i) => ({ ...i })),
    });
  }

  const setItem = (index: number, patch: Partial<DatasetItem>) => {
    if (!draft) return;
    const items = draft.items.map((item, i) => (i === index ? { ...item, ...patch } : item));
    setDraft({ ...draft, items });
  };

  const save = async () => {
    if (!draft) return;
    const items = draft.items
      .map((i) => ({ prompt: i.prompt.trim(), ...(i.context?.trim() ? { context: i.context.trim() } : {}) }))
      .filter((i) => i.prompt !== "");
    if (items.length === 0) return setError(t.console.datasets.itemsRequired);
    setSaving(true);
    setError(null);
    try {
      await api.updateDataset(datasetId, { name: draft.name.trim(), description: draft.description, items });
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
    const blob = new Blob([serializeDataset(draft.items)], { type: "application/json" });
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
        </div>
      )}
    </Card>
  );
}
