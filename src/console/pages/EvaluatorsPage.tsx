import { useState } from "react";
import { Badge, Button, Card } from "../../components/ui";
import { useLiveApi } from "../../lib/useLiveApi";
import { useResource } from "../../lib/useResource";
import { useLang } from "../../i18n/lang";
import {
  BUILTIN_EVALUATORS,
  BUILTIN_EVALUATORS_DOCS_URL,
  CUSTOM_EVALUATOR_SAMPLE,
} from "../../data/evaluators";

interface ScalePoint {
  value: number;
  label: string;
  definition: string;
}

interface EvaluatorDraft {
  name: string;
  level: "TOOL_CALL" | "TRACE" | "SESSION";
  modelId: string;
  instructions: string;
  ratingScale: ScalePoint[];
}

const EMPTY_DRAFT: EvaluatorDraft = {
  name: "",
  level: "TRACE",
  modelId: "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
  instructions: "",
  ratingScale: [
    { value: 1, label: "", definition: "" },
    { value: 0, label: "", definition: "" },
  ],
};

/** Evaluators: built-in catalog + custom LLM-judge create/list/delete. */
export function EvaluatorsPage() {
  const { api, creds } = useLiveApi();
  const { t } = useLang();
  // The service's list includes built-ins; only user-created judges are "custom".
  const custom = useResource(
    () =>
      api.listEvaluators(creds ?? null).then((r) => ({
        evaluators: r.evaluators.filter((e) => !e.evaluatorId.startsWith("Builtin.")),
      })),
    [],
  );
  const [draft, setDraft] = useState<EvaluatorDraft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      await api.createEvaluator({
        name: draft.name.trim(),
        instructions: draft.instructions,
        ratingScale: draft.ratingScale,
        modelId: draft.modelId.trim(),
        level: draft.level,
        creds: creds ?? null,
      });
      setDraft(EMPTY_DRAFT);
      custom.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const setPoint = (index: number, patch: Partial<ScalePoint>) => {
    setDraft({
      ...draft,
      ratingScale: draft.ratingScale.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    });
  };

  const inputCls =
    "w-full rounded-md border border-line bg-ink-900/60 px-3 py-2 text-sm text-fog-100 outline-none focus:border-cyan/60";

  return (
    <div className="space-y-4">
      <Card
        eyebrow={t.console.evaluators.builtinEyebrow}
        title={t.console.evaluators.title}
        accent="cyan"
        action={
          <a
            href={BUILTIN_EVALUATORS_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-mono text-xs text-cyan-soft underline-offset-4 hover:underline"
          >
            ↗ {t.console.evaluators.docsLink}
          </a>
        }
      >
        <ul className="grid gap-2 sm:grid-cols-2">
          {BUILTIN_EVALUATORS.map((ev) => (
            <li key={ev.evaluatorId} className="rounded-md border border-line bg-ink-750/60 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-fog-100">
                  {t.evaluators.labels[ev.evaluatorId] ?? ev.label}
                </span>
                <Badge variant="neutral" mono className="ml-auto">
                  {ev.level}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-fog-400">
                {t.evaluators.descriptions[ev.evaluatorId] ?? ev.description}
              </p>
            </li>
          ))}
        </ul>
      </Card>

      <Card
        eyebrow={t.console.evaluators.customEyebrow}
        title={t.console.evaluators.createTitle}
        accent="orange"
        action={
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              setDraft({
                name: CUSTOM_EVALUATOR_SAMPLE.name,
                level: CUSTOM_EVALUATOR_SAMPLE.level,
                modelId: CUSTOM_EVALUATOR_SAMPLE.modelId,
                instructions: CUSTOM_EVALUATOR_SAMPLE.instructions,
                ratingScale: CUSTOM_EVALUATOR_SAMPLE.ratingScale.map((p) => ({ ...p })),
              })
            }
          >
            {t.console.evaluators.prefillSample}
          </Button>
        }
      >
        {error && (
          <div role="alert" className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </div>
        )}
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="eyebrow mb-1 block">{t.console.common.name}</span>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputCls} />
            </label>
            <label className="block">
              <span className="eyebrow mb-1 block">{t.console.evaluators.level}</span>
              <select
                value={draft.level}
                onChange={(e) => setDraft({ ...draft, level: e.target.value as EvaluatorDraft["level"] })}
                className={inputCls}
              >
                <option value="TRACE">TRACE</option>
                <option value="SESSION">SESSION</option>
                <option value="TOOL_CALL">TOOL_CALL</option>
              </select>
            </label>
            <label className="block">
              <span className="eyebrow mb-1 block">{t.console.evaluators.modelId}</span>
              <input
                value={draft.modelId}
                onChange={(e) => setDraft({ ...draft, modelId: e.target.value })}
                className={`${inputCls} font-mono text-xs`}
              />
            </label>
          </div>

          <label className="block">
            <span className="eyebrow mb-1 block">{t.console.evaluators.instructions}</span>
            <textarea
              value={draft.instructions}
              rows={5}
              onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
              className={`${inputCls} font-mono text-xs`}
            />
          </label>

          <div>
            <span className="eyebrow mb-1 block">{t.console.evaluators.ratingScale}</span>
            <div className="space-y-2">
              {draft.ratingScale.map((p, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[80px_180px_minmax(0,1fr)]">
                  <input
                    type="number"
                    step="0.1"
                    value={p.value}
                    aria-label={t.console.evaluators.scaleValue}
                    onChange={(e) => setPoint(i, { value: Number(e.target.value) })}
                    className={`${inputCls} font-mono text-xs`}
                  />
                  <input
                    value={p.label}
                    placeholder={t.console.evaluators.scaleLabel}
                    onChange={(e) => setPoint(i, { label: e.target.value })}
                    className={`${inputCls} text-xs`}
                  />
                  <input
                    value={p.definition}
                    placeholder={t.console.evaluators.scaleDefinition}
                    onChange={(e) => setPoint(i, { definition: e.target.value })}
                    className={`${inputCls} text-xs`}
                  />
                </div>
              ))}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="mt-2"
              onClick={() =>
                setDraft({ ...draft, ratingScale: [...draft.ratingScale, { value: 0.5, label: "", definition: "" }] })
              }
            >
              {t.console.evaluators.addPoint}
            </Button>
          </div>

          <Button disabled={creating || !draft.name.trim() || !draft.instructions.trim()} onClick={() => void create()}>
            {t.console.evaluators.createBtn}
          </Button>
        </div>

        <div className="mt-6 border-t border-line/60 pt-4">
          <span className="eyebrow mb-2 block">{t.console.evaluators.customEyebrow}</span>
          {custom.loading && <p className="text-sm text-fog-500">{t.console.common.loading}</p>}
          {custom.error && <p className="text-xs text-fog-500">{t.console.evaluators.loadFailed}</p>}
          {custom.data && custom.data.evaluators.length === 0 && (
            <p className="text-sm text-fog-400">{t.console.evaluators.noCustom}</p>
          )}
          <ul className="space-y-2">
            {custom.data?.evaluators.map((ev) => (
              <li key={ev.evaluatorId} className="flex items-center gap-3 rounded-md border border-line bg-ink-750/60 px-3 py-2">
                <span className="text-sm font-semibold text-fog-100">{ev.name}</span>
                {ev.level && (
                  <Badge variant="neutral" mono>
                    {ev.level}
                  </Badge>
                )}
                <span className="ml-auto">
                  {confirmId === ev.evaluatorId ? (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        setConfirmId(null);
                        void api.deleteEvaluator(ev.evaluatorId).then(custom.reload).catch((e: unknown) =>
                          setError(e instanceof Error ? e.message : String(e)),
                        );
                      }}
                    >
                      {t.console.common.confirmDelete}
                    </Button>
                  ) : (
                    <Button size="sm" variant="danger" onClick={() => setConfirmId(ev.evaluatorId)}>
                      {t.console.common.delete}
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </div>
  );
}
