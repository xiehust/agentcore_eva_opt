import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, Badge, Button, CodeBlock } from "../components/ui";
import { ScoreCard } from "../components/ScoreCard";
import { AsyncRunButton } from "../components/AsyncRunButton";
import { LiveRunButton } from "../components/LiveRunButton";
import { useJourney } from "../state/journey";
import { useLiveApi } from "../lib/useLiveApi";
import { StepHeader } from "./StepScaffold";
import { evalStages } from "../sim/engine";
import { BASELINE_SCORES } from "../data/results";
import {
  BUILTIN_EVALUATORS,
  DEFAULT_EVALUATOR_IDS,
  EVALUATOR_LABELS,
  CUSTOM_EVALUATOR_SAMPLE,
  simScoreFor,
} from "../data/evaluators";
import { useLang } from "../i18n/lang";
import type { EvaluatorScore } from "../sim/types";

interface EvalJobResult {
  batchEvaluationId: string;
  status: string;
  scores: { evaluatorId: string; score: number }[];
}

const DEFAULT_IDS = new Set<string>(DEFAULT_EVALUATOR_IDS);

/** Non-default built-ins, selectable as extras. */
const OPTIONAL_BUILTINS = BUILTIN_EVALUATORS.filter(
  (e) => !DEFAULT_IDS.has(e.evaluatorId),
);

const customEvaluatorSnippet = `# Custom LLM-as-a-judge evaluator (control plane)
agentcore_control.create_evaluator(
    evaluatorName="${CUSTOM_EVALUATOR_SAMPLE.name}",
    level="${CUSTOM_EVALUATOR_SAMPLE.level}",  # placeholders: {context}, {assistant_turn}
    evaluatorConfig={"llmAsAJudge": {
        "instructions": POLICY_COMPLIANCE_PROMPT,
        "ratingScale": {"numerical": [
            {"value": 1,   "label": "Compliant",  "definition": "..."},
            {"value": 0.5, "label": "Borderline", "definition": "..."},
            {"value": 0,   "label": "Violation",  "definition": "..."},
        ]},
        "modelConfig": {"bedrockEvaluatorModelConfig": {
            "modelId": "${CUSTOM_EVALUATOR_SAMPLE.modelId}"}},
    }},
)
# Then reference it in the batch evaluation next to the built-ins:
#   evaluators=[..., {"evaluatorId": custom_evaluator_id}]`;

/** Step 4 — run a batch evaluation and reveal the baseline scores to beat. */
export function Step4Eval() {
  const { state, dispatch } = useJourney();
  const { t } = useLang();
  const { api, isLive, creds } = useLiveApi();
  const [done, setDone] = useState<boolean>(state.status.eval === "done");
  // Rehydrate real scores from persisted artifacts — COMPLETE_STEP navigates
  // to Step 5, so returning here remounts with fresh state.
  const [scores, setScores] = useState<EvaluatorScore[]>(() => {
    const saved = state.artifacts.evalScores;
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { evaluatorId: string; score: number }[];
        return parsed.map((s) => ({
          evaluatorId: s.evaluatorId,
          label:
            t.evaluators.labels[s.evaluatorId] ??
            EVALUATOR_LABELS[s.evaluatorId] ??
            s.evaluatorId,
          score: s.score,
        }));
      } catch {
        /* corrupt snapshot — fall back to sim baseline */
      }
    }
    return BASELINE_SCORES;
  });
  const [extraIds, setExtraIds] = useState<Set<string>>(new Set());
  const [useCustom, setUseCustom] = useState(false);
  const [showCustomCode, setShowCustomCode] = useState(false);

  const toggleExtra = (id: string) =>
    setExtraIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** All evaluator rows the run will score, in display order. */
  const selection = useMemo(() => {
    const rows: { evaluatorId: string; label: string }[] = [
      ...DEFAULT_EVALUATOR_IDS.map((id) => ({
        evaluatorId: id,
        label: t.evaluators.labels[id] ?? EVALUATOR_LABELS[id] ?? id,
      })),
      ...OPTIONAL_BUILTINS.filter((e) => extraIds.has(e.evaluatorId)).map(
        (e) => ({
          evaluatorId: e.evaluatorId,
          label: t.evaluators.labels[e.evaluatorId] ?? e.label,
        }),
      ),
    ];
    if (useCustom) {
      rows.push({
        evaluatorId: CUSTOM_EVALUATOR_SAMPLE.name,
        label: CUSTOM_EVALUATOR_SAMPLE.name,
      });
    }
    return rows;
  }, [extraIds, useCustom, t]);

  const finish = (final: EvaluatorScore[]) => {
    setScores(final);
    setDone(true);
    const byId = Object.fromEntries(final.map((s) => [s.evaluatorId, s.score]));
    dispatch({
      type: "COMPLETE_STEP",
      step: "eval",
      artifacts: {
        evalGoalSuccess: byId["Builtin.GoalSuccessRate"],
        evalHelpfulness: byId["Builtin.Helpfulness"],
        evalCorrectness: byId["Builtin.Correctness"],
        evalScores: JSON.stringify(
          final.map((s) => ({ evaluatorId: s.evaluatorId, score: s.score })),
        ),
      },
    });
  };

  // Sim: authored scores for whatever is selected.
  const completeSim = () =>
    finish(
      selection.map((s) => ({
        evaluatorId: s.evaluatorId,
        label: s.label,
        score: simScoreFor(s.evaluatorId),
      })),
    );

  // Live: optionally create the custom evaluator, then run a real batch
  // evaluation over the deployed service's log groups with the selection.
  const runLiveEval = async (onProgress: (m: string) => void) => {
    const serviceName = state.artifacts.serviceName ?? state.artifacts.v1Name ?? "";
    const logGroup = state.artifacts.logGroup ?? "";
    const evaluators: string[] = [
      ...DEFAULT_EVALUATOR_IDS,
      ...OPTIONAL_BUILTINS.filter((e) => extraIds.has(e.evaluatorId)).map(
        (e) => e.evaluatorId,
      ),
    ];
    let customId = state.artifacts.customEvaluatorId as string | undefined;
    if (useCustom && !customId) {
      onProgress("creating custom evaluator");
      const created = await api.createEvaluator({
        name: `${CUSTOM_EVALUATOR_SAMPLE.name}${state.artifacts.suffix ?? ""}`,
        instructions: CUSTOM_EVALUATOR_SAMPLE.instructions,
        ratingScale: CUSTOM_EVALUATOR_SAMPLE.ratingScale,
        modelId: CUSTOM_EVALUATOR_SAMPLE.modelId,
        level: CUSTOM_EVALUATOR_SAMPLE.level,
        description: CUSTOM_EVALUATOR_SAMPLE.description,
        creds,
      });
      customId = created.evaluatorId;
      dispatch({
        type: "SET_ARTIFACT",
        artifacts: { customEvaluatorId: customId },
      });
    }
    if (useCustom && customId) evaluators.push(customId);
    const { jobId } = await api.evaluate({
      batchName: `HRBaseline${state.artifacts.suffix ?? ""}`,
      serviceName,
      logGroups: ["aws/spans", logGroup].filter(Boolean),
      evaluators,
      creds,
    });
    const job = await api.pollJob<EvalJobResult>(jobId, {
      onProgress: (s) => onProgress(s.progress ?? s.state),
    });
    const live: EvaluatorScore[] = (job.scores ?? []).map((s) => ({
      evaluatorId: s.evaluatorId,
      label: t.evaluators.labels[s.evaluatorId] ?? EVALUATOR_LABELS[s.evaluatorId] ?? s.evaluatorId,
      score: s.score,
    }));
    if (live.length) finish(live);
    else setDone(true);
    return job;
  };

  return (
    <div>
      <StepHeader index={4} title={t.steps.eval.title} lede={t.steps.eval.lede} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <Card eyebrow={t.step4.evalEyebrow} title={t.step4.evalTitle} accent="orange">
            {isLive ? (
              <LiveRunButton
                label={t.step4.startBtnLive}
                doneLabel={t.step4.evaluated}
                run={runLiveEval}
              />
            ) : (
              <AsyncRunButton
                label={t.step4.startBtn}
                doneLabel={t.step4.evaluated}
                stages={evalStages("batch evaluation")}
                onComplete={completeSim}
              />
            )}
            <p className="mt-4 text-xs text-fog-500">
              {t.step4.runHint(selection.length)}
            </p>
          </Card>

          {/* Evaluator selection: default trio + optional built-ins + custom */}
          <Card
            eyebrow={t.step4.pickerEyebrow}
            title={t.step4.pickerTitle}
            accent="cyan"
            action={
              <Badge variant="neutral" mono>
                {t.step4.pickerSelected(selection.length)}
              </Badge>
            }
          >
            <p className="mb-2 text-xs text-fog-500">{t.step4.pickerHint}</p>
            <ul className="space-y-1" data-testid="evaluator-picker">
              {BUILTIN_EVALUATORS.map((e) => {
                const isDefault = DEFAULT_IDS.has(e.evaluatorId);
                const checked = isDefault || extraIds.has(e.evaluatorId);
                return (
                  <li key={e.evaluatorId}>
                    <label
                      className={
                        "flex cursor-pointer items-center gap-2 rounded border border-line/60 px-2 py-1.5 text-xs " +
                        (checked ? "bg-ink-750/70" : "bg-ink-900/40") +
                        (isDefault ? " opacity-80" : "")
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isDefault || done}
                        onChange={() => toggleExtra(e.evaluatorId)}
                        className="accent-cyan-soft"
                      />
                      <span className="font-medium text-fog-200">
                        {t.evaluators.labels[e.evaluatorId] ?? e.label}
                      </span>
                      <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-fog-600">
                        {t.step4.levels[e.level]}
                        {isDefault && ` · ${t.step4.default}`}
                      </span>
                    </label>
                  </li>
                );
              })}
              {/* Sample custom evaluator */}
              <li>
                <label
                  className={
                    "flex cursor-pointer items-center gap-2 rounded border border-aws-orange-soft/40 px-2 py-1.5 text-xs " +
                    (useCustom ? "bg-ink-750/70" : "bg-ink-900/40")
                  }
                >
                  <input
                    type="checkbox"
                    checked={useCustom}
                    disabled={done}
                    onChange={() => setUseCustom((v) => !v)}
                    className="accent-aws-orange-soft"
                  />
                  <span className="font-medium text-fog-200">
                    {CUSTOM_EVALUATOR_SAMPLE.name}
                  </span>
                  <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-aws-orange-soft">
                    {t.step4.customTag}
                  </span>
                </label>
              </li>
            </ul>
            <p className="mt-2 text-xs text-fog-500">
              {t.evaluators.customDescription}
            </p>
            <Button
              variant="ghost"
              className="mt-2 text-xs"
              onClick={() => setShowCustomCode((v) => !v)}
            >
              {showCustomCode ? t.step4.hideCustomCode : t.step4.showCustomCode}
            </Button>
            {showCustomCode && (
              <div className="mt-2" data-testid="custom-evaluator-code">
                <CodeBlock code={customEvaluatorSnippet} language="python" />
              </div>
            )}
          </Card>
        </div>

        <Card
          eyebrow={t.step4.scoresEyebrow}
          title={t.step4.scoresTitle}
          accent="cyan"
          className="lg:col-span-2"
          action={
            done ? (
              <Badge variant="ok" dot>
                {t.step4.baselineCaptured}
              </Badge>
            ) : (
              <Badge variant="neutral">{t.common.pending}</Badge>
            )
          }
        >
          {done ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-3"
            >
              <div className="grid gap-3 sm:grid-cols-3">
                {scores.map((s) => (
                  <ScoreCard key={s.evaluatorId} label={s.label} score={s.score} />
                ))}
              </div>
              <ul className="mt-2 space-y-1 text-xs text-fog-500">
                {scores.map((s) => (
                  <li key={s.evaluatorId}>
                    <span className="font-mono text-fog-300">{s.label}</span> —{" "}
                    {t.evaluators.descriptions[s.evaluatorId] ??
                      t.evaluators.customDescription}
                  </li>
                ))}
              </ul>
            </motion.div>
          ) : (
            <p className="text-sm text-fog-500">
              {t.step4.emptyHint}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
