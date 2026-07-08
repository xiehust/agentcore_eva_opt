import { useState } from "react";
import { motion } from "framer-motion";
import { Card, Badge, Button } from "../components/ui";
import { AsyncRunButton } from "../components/AsyncRunButton";
import { useJourney } from "../state/journey";
import { StepHeader } from "./StepScaffold";
import { insightStages } from "../sim/engine";
import {
  SIM_EXECUTION_SUMMARIES,
  SIM_FAILURES,
  SIM_INSIGHTS_TOTALS,
  SIM_USER_INTENTS,
} from "../data/insights";
import { useLang } from "../i18n/lang";

/** Step 5 — Insights triage: WHY the agent fails, WHAT users want, HOW it
 * behaves — the bridge from Step 4's scores to Step 6's recommendations.
 * (The wizard runs sim-only; the Live console has its own Insights page.) */
export function Step5Insights() {
  const { state, dispatch } = useJourney();
  const { t } = useLang();
  // Results stay visible after the run; advancing is an explicit action
  // (COMPLETE_STEP navigates to the next step immediately).
  const [done, setDone] = useState<boolean>(state.status.insights === "done");
  const advanced = state.status.insights === "done";

  const continueToRecommend = () => {
    dispatch({ type: "COMPLETE_STEP", step: "insights", artifacts: {} });
  };

  return (
    <div>
      <StepHeader
        index={5}
        title={t.steps.insights.title}
        lede={t.steps.insights.lede}
        learn={t.steps.insights.learn}
      />

      <div className="space-y-6">
        <div className="space-y-6">
          <Card
            eyebrow={t.stepInsights.runEyebrow}
            title={t.stepInsights.runTitle}
            accent="orange"
          >
            <AsyncRunButton
              label={t.stepInsights.startBtn}
              doneLabel={t.stepInsights.analyzed}
              stages={insightStages()}
              onComplete={() => setDone(true)}
            />
            <p className="mt-4 text-xs text-fog-500">
              {t.stepInsights.runHint(SIM_INSIGHTS_TOTALS.sessions)}
            </p>
          </Card>

          <Card
            eyebrow={t.stepInsights.typesEyebrow}
            title={t.stepInsights.typesTitle}
            accent="cyan"
          >
            <ul className="space-y-2 text-xs leading-relaxed text-fog-400">
              <li>
                <span className="font-mono text-fog-200">
                  Builtin.Insight.FailureAnalysis
                </span>{" "}
                — {t.stepInsights.typeFailure}
              </li>
              <li>
                <span className="font-mono text-fog-200">
                  Builtin.Insight.UserIntent
                </span>{" "}
                — {t.stepInsights.typeIntent}
              </li>
              <li>
                <span className="font-mono text-fog-200">
                  Builtin.Insight.ExecutionSummary
                </span>{" "}
                — {t.stepInsights.typeExecution}
              </li>
            </ul>
            <p className="mt-3 text-xs text-fog-500">{t.stepInsights.exclusiveNote}</p>
          </Card>
        </div>

        <Card
          eyebrow={t.stepInsights.resultsEyebrow}
          title={t.stepInsights.resultsTitle}
          accent="cyan"
          action={
            done ? (
              <Badge variant="danger" dot>
                {t.stepInsights.failureBadge(SIM_INSIGHTS_TOTALS.failureSessions)}
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
              className="space-y-6"
              data-testid="insights-results"
            >
              {/* Failure taxonomy tree */}
              <section>
                <h4 className="eyebrow mb-2">{t.stepInsights.failuresTitle}</h4>
                <div className="space-y-2">
                  {SIM_FAILURES.map((cat, i) => (
                    <details
                      key={cat.name}
                      open={i === 0}
                      className="rounded-md border border-danger/30 bg-ink-750/40"
                    >
                      <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-3 py-2.5">
                        <span className="text-sm font-semibold text-fog-100">
                          {cat.name}
                        </span>
                        <Badge variant="danger" mono>
                          {t.stepInsights.sessionCount(cat.affectedSessionCount)}
                        </Badge>
                        <span className="w-full text-xs text-fog-400 sm:ml-auto sm:w-auto">
                          {cat.description}
                        </span>
                      </summary>
                      <div className="space-y-2 border-t border-line/60 px-3 py-2.5">
                        {cat.subCategories.map((sub) => (
                          <div
                            key={sub.name}
                            className="rounded border border-line/60 bg-ink-900/40 p-2.5"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-semibold text-fog-200">
                                {sub.name}
                              </span>
                              <Badge variant="warn" mono>
                                {t.stepInsights.sessionCount(sub.affectedSessionCount)}
                              </Badge>
                            </div>
                            {sub.rootCauses.map((rc) => (
                              <div
                                key={rc.name}
                                className="mt-2 border-l-2 border-aws-orange/50 pl-3"
                              >
                                <p className="text-xs text-fog-200">{rc.name}</p>
                                <p className="mt-1 text-[11px] leading-relaxed text-cyan">
                                  <span className="font-semibold">
                                    {t.stepInsights.recommendation}:
                                  </span>{" "}
                                  {rc.recommendation}
                                </p>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </section>

              {/* Intent + execution clusters */}
              <section>
                <h4 className="eyebrow mb-2">{t.stepInsights.intentsTitle}</h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  {SIM_USER_INTENTS.map((c) => (
                    <div
                      key={c.name}
                      className="rounded-md border border-line bg-ink-750/40 p-3"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-fog-100">
                          {c.name}
                        </span>
                        <Badge variant="cyan" mono className="ml-auto">
                          {t.stepInsights.sessionCount(c.affectedSessionCount)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-fog-400">
                        {c.description}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h4 className="eyebrow mb-2">{t.stepInsights.executionTitle}</h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  {SIM_EXECUTION_SUMMARIES.map((c) => (
                    <div
                      key={c.name}
                      className="rounded-md border border-line bg-ink-750/40 p-3"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-fog-100">
                          {c.name}
                        </span>
                        <Badge variant="neutral" mono className="ml-auto">
                          {t.stepInsights.sessionCount(c.affectedSessionCount)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-fog-400">
                        {c.description}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <div className="flex flex-wrap items-center gap-4">
                {!advanced && (
                  <Button onClick={continueToRecommend}>
                    {t.stepInsights.continueBtn}
                  </Button>
                )}
                <p className="text-xs leading-relaxed text-fog-500">
                  {t.stepInsights.bridgeNote}
                </p>
              </div>
            </motion.div>
          ) : (
            <p className="text-sm text-fog-500">{t.stepInsights.emptyHint}</p>
          )}
        </Card>
      </div>
    </div>
  );
}
