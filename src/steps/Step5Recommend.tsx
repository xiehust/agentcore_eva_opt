import { useState } from "react";
import { motion } from "framer-motion";
import { Card, Badge, Button } from "../components/ui";
import { DiffView } from "../components/DiffView";
import { AsyncRunButton } from "../components/AsyncRunButton";
import { LiveRunButton } from "../components/LiveRunButton";
import { useJourney } from "../state/journey";
import { useLiveApi } from "../lib/useLiveApi";
import { StepHeader } from "./StepScaffold";
import { useLang } from "../i18n/lang";
import { evalStages } from "../sim/engine";
import { CURRENT_SYSTEM_PROMPT, CURRENT_TOOL_DESCRIPTIONS } from "../data/agent";
import {
  RECOMMENDED_SYSTEM_PROMPT,
  RECOMMENDED_TOOL_DESCRIPTIONS,
} from "../data/recommendations";

/** Step 5 — generate and review system-prompt + tool-description improvements. */
export function Step5Recommend() {
  const { state, dispatch } = useJourney();
  const { t } = useLang();
  const { api, isLive, creds } = useLiveApi();
  const [spDone, setSpDone] = useState(false);
  const [tdDone, setTdDone] = useState(false);
  const accepted = !!state.artifacts.recommendationsAccepted;

  const toolNames = Object.keys(CURRENT_TOOL_DESCRIPTIONS);

  // Live recommendation results (fall back to the authored ones for display).
  const [liveSysPrompt, setLiveSysPrompt] = useState<string | null>(null);
  const [liveToolDescs, setLiveToolDescs] = useState<Record<string, string> | null>(
    null,
  );
  const shownSysPrompt = liveSysPrompt ?? RECOMMENDED_SYSTEM_PROMPT;
  const shownToolDescs = liveToolDescs ?? RECOMMENDED_TOOL_DESCRIPTIONS;

  const logGroupArns = () => {
    const lg = state.artifacts.logGroup ?? "";
    return lg ? [lg] : [];
  };
  const serviceNames = () => {
    const s = state.artifacts.serviceName ?? state.artifacts.v1Name ?? "";
    return s ? [s] : [];
  };

  const runLiveSysPrompt = async (onProgress: (m: string) => void) => {
    const { jobId } = await api.recommendSystemPrompt({
      name: `HRSpRec${state.artifacts.suffix ?? ""}`,
      systemPrompt: CURRENT_SYSTEM_PROMPT,
      logGroupArns: logGroupArns(),
      serviceNames: serviceNames(),
      creds,
    });
    const job = await api.pollJob<{ recommendedSystemPrompt: string }>(jobId, {
      onProgress: (s) => onProgress(s.progress ?? s.state),
    });
    setLiveSysPrompt(job.recommendedSystemPrompt);
    setSpDone(true);
    return job;
  };

  const runLiveToolDescs = async (onProgress: (m: string) => void) => {
    const { jobId } = await api.recommendToolDescriptions({
      name: `HRTdRec${state.artifacts.suffix ?? ""}`,
      tools: toolNames.map((n) => ({
        toolName: n,
        description: CURRENT_TOOL_DESCRIPTIONS[n],
      })),
      logGroupArns: logGroupArns(),
      serviceNames: serviceNames(),
      creds,
    });
    const job = await api.pollJob<{
      recommendedToolDescriptions: Record<string, string>;
    }>(jobId, { onProgress: (s) => onProgress(s.progress ?? s.state) });
    setLiveToolDescs(job.recommendedToolDescriptions);
    setTdDone(true);
    return job;
  };

  const accept = () => {
    dispatch({
      type: "COMPLETE_STEP",
      step: "recommend",
      artifacts: { recommendationsAccepted: true },
    });
  };

  return (
    <div>
      <StepHeader index={6} title={t.steps.recommend.title} lede={t.steps.recommend.lede} />

      <div className="space-y-6">
        {/* 5a — system prompt */}
        <Card
          eyebrow={t.step5.spEyebrow}
          title={t.step5.spTitle}
          accent="orange"
          action={spDone && <Badge variant="ok" dot>{t.common.generated}</Badge>}
        >
          {!spDone ? (
            isLive ? (
              <LiveRunButton
                label={t.step5.spBtnLive}
                doneLabel={t.common.generated}
                run={runLiveSysPrompt}
              />
            ) : (
              <AsyncRunButton
                label={t.step5.spBtn}
                doneLabel={t.common.generated}
                stages={evalStages("system-prompt recommendation")}
                onComplete={() => setSpDone(true)}
              />
            )
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <DiffView
                before={CURRENT_SYSTEM_PROMPT}
                after={shownSysPrompt}
                beforeLabel={t.step5.currentPrompt}
                afterLabel={t.step5.recommendedPrompt}
              />
            </motion.div>
          )}
        </Card>

        {/* 5b — tool descriptions */}
        <Card
          eyebrow={t.step5.tdEyebrow}
          title={t.step5.tdTitle}
          accent="cyan"
          action={tdDone && <Badge variant="ok" dot>{t.common.generated}</Badge>}
        >
          {!tdDone ? (
            isLive ? (
              <LiveRunButton
                label={t.step5.tdBtnLive}
                doneLabel={t.common.generated}
                run={runLiveToolDescs}
              />
            ) : (
              <AsyncRunButton
                label={t.step5.tdBtn}
                doneLabel={t.common.generated}
                stages={evalStages("tool-description recommendation")}
                onComplete={() => setTdDone(true)}
              />
            )
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              {toolNames.map((name) => (
                <div key={name}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <Badge variant="orange" mono>
                      {name}
                    </Badge>
                  </div>
                  <DiffView
                    before={CURRENT_TOOL_DESCRIPTIONS[name]}
                    after={shownToolDescs[name] ?? CURRENT_TOOL_DESCRIPTIONS[name]}
                    beforeLabel={t.step5.before}
                    afterLabel={t.step5.after}
                  />
                </div>
              ))}
            </motion.div>
          )}
        </Card>

        {/* Accept */}
        {spDone && tdDone && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card accent="orange">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-display text-base font-semibold text-fog-100">
                    {t.step5.acceptTitle}
                  </p>
                  <p className="mt-1 text-sm text-fog-300">
                    {t.step5.acceptBody}
                  </p>
                </div>
                <Button onClick={accept} disabled={accepted}>
                  {accepted ? t.step5.accepted : t.step5.acceptBtn}
                </Button>
              </div>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}
