import { useState } from "react";
import { motion } from "framer-motion";
import { Card, Badge, Button } from "../components/ui";
import { AsyncRunButton } from "../components/AsyncRunButton";
import { useJourney } from "../state/journey";
import { StepHeader } from "./StepScaffold";
import { datasetEvalStages, userSimStages } from "../sim/engine";
import {
  SIM_DATASET_EVAL_RESULTS,
  SIM_DATASET_EVAL_TOTALS,
  SIM_PREDEFINED_SCENARIOS,
  SIM_SIMULATED_SCENARIOS,
  SIM_SIMULATION_TRANSCRIPTS,
} from "../data/datasetEval";
import { useLang } from "../i18n/lang";

/** Step 5 — Dataset evaluation & User simulation: run the agent against a
 * scenario dataset (ground truth included), then let an LLM actor play the
 * user. The partial trajectory failure it surfaces feeds Step 6's Insights.
 * (Sim-only; the Live console runs the real thing from Datasets/Runs.) */
export function Step5DatasetEval() {
  const { state, dispatch } = useJourney();
  const { t } = useLang();
  const [evalDone, setEvalDone] = useState<boolean>(state.status.datasetEval === "done");
  const [simDone, setSimDone] = useState<boolean>(state.status.datasetEval === "done");
  const advanced = state.status.datasetEval === "done";

  const continueToInsights = () => {
    dispatch({ type: "COMPLETE_STEP", step: "datasetEval", artifacts: {} });
  };

  return (
    <div>
      <StepHeader
        index={5}
        title={t.steps.datasetEval.title}
        lede={t.steps.datasetEval.lede}
        learn={t.steps.datasetEval.learn}
      />

      <div className="space-y-6">
        {/* ── Part 1: dataset evaluation ─────────────────────────────── */}
        <Card
          eyebrow={t.stepDatasetEval.datasetEyebrow}
          title={t.stepDatasetEval.datasetTitle}
          accent="cyan"
        >
          <p className="mb-3 text-xs leading-relaxed text-fog-400">
            {t.stepDatasetEval.datasetIntro}
          </p>
          <div className="space-y-2" data-testid="scenario-cards">
            {SIM_PREDEFINED_SCENARIOS.map((sc) => (
              <details key={sc.scenario_id} className="rounded-md border border-line bg-ink-750/40 px-3 py-2">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm text-fog-200">
                  <span className="font-mono text-xs">{sc.scenario_id}</span>
                  <Badge variant="cyan" mono className="text-[10px]">
                    {t.stepDatasetEval.turnCount(sc.turns.length)}
                  </Badge>
                  {sc.expected_trajectory && (
                    <span className="font-mono text-[10px] text-fog-500">
                      {sc.expected_trajectory.join(" → ")}
                    </span>
                  )}
                </summary>
                <ol className="mt-2 space-y-1 border-t border-line/50 pt-2">
                  {sc.turns.map((turn, i) => (
                    <li key={i} className="text-xs leading-relaxed">
                      <p className="text-aws-orange-soft">
                        <span className="font-mono text-[10px] text-fog-500">T{i + 1}:</span> {turn.input}
                      </p>
                      {turn.expected_response && (
                        <p className="text-fog-500">
                          <span className="font-mono text-[10px]">expected_response:</span> {turn.expected_response}
                        </p>
                      )}
                    </li>
                  ))}
                  {sc.assertions && (
                    <li className="text-[11px] text-fog-500">
                      <span className="font-mono text-[10px]">assertions:</span> {sc.assertions.join(" · ")}
                    </li>
                  )}
                </ol>
              </details>
            ))}
          </div>

          <div className="mt-4">
            <AsyncRunButton
              label={t.stepDatasetEval.runDatasetBtn}
              doneLabel={t.stepDatasetEval.datasetDone}
              stages={datasetEvalStages()}
              onComplete={() => setEvalDone(true)}
            />
            <p className="mt-3 text-xs text-fog-500">{t.stepDatasetEval.runnerNote}</p>
          </div>

          {evalDone && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-4"
              data-testid="dataset-eval-results"
            >
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <h4 className="eyebrow">{t.stepDatasetEval.resultsTitle}</h4>
                {SIM_DATASET_EVAL_TOTALS.averages.map((a) => (
                  <Badge key={a.evaluatorId} variant={a.score >= 0.8 ? "ok" : "warn"} mono className="text-[10px]">
                    {a.evaluatorId.replace("Builtin.", "")} {a.score.toFixed(2)}
                  </Badge>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-line text-left">
                      <th className="px-2 py-1.5 font-mono text-[11px] font-normal text-fog-500">scenario_id</th>
                      {SIM_DATASET_EVAL_RESULTS[0].scores.map((s) => (
                        <th key={s.evaluatorId} className="px-2 py-1.5 font-mono text-[11px] font-normal text-fog-500">
                          {s.evaluatorId.replace("Builtin.", "")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SIM_DATASET_EVAL_RESULTS.map((row) => (
                      <tr key={row.scenario_id} className="border-b border-line/50">
                        <td className="px-2 py-1.5 font-mono text-[11px] text-fog-200">{row.scenario_id}</td>
                        {row.scores.map((s) => (
                          <td key={s.evaluatorId} className={`px-2 py-1.5 font-mono ${s.pass ? "text-ok" : "text-danger"}`}>
                            {s.score.toFixed(2)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-warn">{t.stepDatasetEval.failureNote}</p>
            </motion.div>
          )}
        </Card>

        {/* ── Part 2: user simulation ────────────────────────────────── */}
        <Card
          eyebrow={t.stepDatasetEval.simEyebrow}
          title={t.stepDatasetEval.simTitle}
          accent="orange"
        >
          <p className="mb-3 text-xs leading-relaxed text-fog-400">{t.stepDatasetEval.simIntro}</p>
          <div className="grid gap-2 sm:grid-cols-2" data-testid="persona-cards">
            {SIM_SIMULATED_SCENARIOS.map((sc) => (
              <div key={sc.scenario_id} className="rounded-md border border-line bg-ink-750/40 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-fog-100">{sc.scenario_id}</span>
                  <Badge variant="orange" mono className="text-[10px]">
                    max_turns {sc.max_turns}
                  </Badge>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-fog-400">{sc.actor_profile.context}</p>
                <p className="mt-1 text-[11px] text-cyan-soft">
                  <span className="font-semibold">{t.stepDatasetEval.goalLabel}:</span> {sc.actor_profile.goal}
                </p>
                <p className="mt-1 font-mono text-[10px] text-fog-500">
                  {Object.entries(sc.actor_profile.traits)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(" · ")}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <AsyncRunButton
              label={t.stepDatasetEval.runSimBtn}
              doneLabel={t.stepDatasetEval.simDone}
              stages={userSimStages()}
              onComplete={() => setSimDone(true)}
              variant="secondary"
            />
            <p className="mt-3 text-xs text-fog-500">{t.stepDatasetEval.simCostNote}</p>
          </div>

          {simDone && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-4 space-y-3"
              data-testid="sim-transcripts"
            >
              <h4 className="eyebrow">{t.stepDatasetEval.transcriptsTitle}</h4>
              {SIM_SIMULATION_TRANSCRIPTS.map((tr, ti) => (
                <details key={tr.scenario_id} open={ti === 0} className="rounded-md border border-line bg-ink-750/40 px-3 py-2">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm text-fog-200">
                    <span className="font-mono text-xs">{tr.scenario_id}</span>
                    <Badge variant={tr.stopped_by === "goal" ? "ok" : "warn"} mono className="text-[10px]">
                      {tr.stopped_by === "goal" ? t.stepDatasetEval.stopGoal : t.stepDatasetEval.stopMaxTurns}
                    </Badge>
                    <span className="font-mono text-[11px] text-fog-500">{t.stepDatasetEval.turnCount(tr.turns)}</span>
                    {tr.scores.map((s) => (
                      <Badge key={s.evaluatorId} variant={s.pass ? "ok" : "danger"} mono className="ml-auto text-[10px]">
                        {s.evaluatorId.replace("Builtin.", "")} {s.score.toFixed(2)}
                      </Badge>
                    ))}
                  </summary>
                  <ol className="mt-2 space-y-1.5 border-t border-line/50 pt-2">
                    {tr.transcript.map((entry, i) => (
                      <motion.li
                        key={i}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: ti === 0 ? i * 0.12 : 0 }}
                        className="text-xs leading-relaxed"
                      >
                        {entry.role === "actor_reasoning" ? (
                          <p className="italic text-fog-500">
                            <span className="font-mono text-[10px] uppercase tracking-wide">
                              {t.stepDatasetEval.roleActorReasoning}:
                            </span>{" "}
                            {entry.text}
                          </p>
                        ) : (
                          <p className={entry.role === "user" ? "text-aws-orange-soft" : "text-fog-200"}>
                            <span className="font-mono text-[10px] uppercase tracking-wide text-fog-500">
                              {entry.role} · T{entry.turn}:
                            </span>{" "}
                            {entry.text}
                          </p>
                        )}
                      </motion.li>
                    ))}
                  </ol>
                </details>
              ))}

              <div className="flex flex-wrap items-center gap-4">
                {!advanced && (
                  <Button onClick={continueToInsights} disabled={!evalDone}>
                    {t.stepDatasetEval.continueBtn}
                  </Button>
                )}
                <p className="text-xs leading-relaxed text-fog-500">{t.stepDatasetEval.bridgeNote}</p>
              </div>
            </motion.div>
          )}
        </Card>
      </div>
    </div>
  );
}
