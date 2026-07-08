import { useState } from "react";
import { motion } from "framer-motion";
import { Card, Stat, Badge, Button } from "../components/ui";
import { DiffView } from "../components/DiffView";
import { useJourney } from "../state/journey";
import { useLiveApi } from "../lib/useLiveApi";
import { StepHeader } from "./StepScaffold";
import { useLang } from "../i18n/lang";
import { makeSuffix } from "../sim/engine";
import { CURRENT_SYSTEM_PROMPT, CURRENT_TOOL_DESCRIPTIONS } from "../data/agent";
import {
  RECOMMENDED_SYSTEM_PROMPT,
  RECOMMENDED_TOOL_DESCRIPTIONS,
} from "../data/recommendations";

/** Step 6 — create control + treatment bundles, read back, and compare versions. */
export function Step6Bundles() {
  const { state, dispatch } = useJourney();
  const { t } = useLang();
  const { api, isLive, creds } = useLiveApi();
  const [liveErr, setLiveErr] = useState("");
  const [control, setControl] = useState<{ id: string; ver: string } | null>(
    state.artifacts.controlBundleId
      ? { id: state.artifacts.controlBundleId, ver: state.artifacts.controlBundleVersion ?? "" }
      : null,
  );
  const [treatment, setTreatment] = useState<{ id: string; ver: string } | null>(
    state.artifacts.treatmentBundleId
      ? { id: state.artifacts.treatmentBundleId, ver: state.artifacts.treatmentBundleVersion ?? "" }
      : null,
  );
  const [showCompare, setShowCompare] = useState(false);

  const createControl = async () => {
    setLiveErr("");
    let c: { id: string; ver: string };
    if (isLive) {
      try {
        const r = await api.createBundle({
          agentArn: state.artifacts.agentArn ?? "",
          name: `HRControl${state.artifacts.suffix ?? ""}`,
          systemPrompt: CURRENT_SYSTEM_PROMPT,
          toolDescriptions: CURRENT_TOOL_DESCRIPTIONS,
          commitMessage: "Control: original (v1 baseline)",
          creds,
        });
        c = { id: r.bundleId, ver: r.versionId };
      } catch (e) {
        setLiveErr(e instanceof Error ? e.message : String(e));
        return;
      }
    } else {
      c = { id: `bndl-${makeSuffix()}`, ver: `ver-${makeSuffix()}` };
    }
    setControl(c);
    dispatch({
      type: "SET_ARTIFACT",
      artifacts: { controlBundleId: c.id, controlBundleVersion: c.ver },
    });
  };

  const createTreatment = async () => {
    setLiveErr("");
    let t: { id: string; ver: string };
    if (isLive) {
      try {
        const r = await api.createBundle({
          agentArn: state.artifacts.agentArn ?? "",
          name: `HRTreatment${state.artifacts.suffix ?? ""}`,
          systemPrompt: RECOMMENDED_SYSTEM_PROMPT,
          toolDescriptions: RECOMMENDED_TOOL_DESCRIPTIONS,
          commitMessage: "Treatment: AI-recommended prompt + tool descriptions",
          creds,
        });
        t = { id: r.bundleId, ver: r.versionId };
      } catch (e) {
        setLiveErr(e instanceof Error ? e.message : String(e));
        return;
      }
    } else {
      t = { id: `bndl-${makeSuffix()}`, ver: `ver-${makeSuffix()}` };
    }
    setTreatment(t);
    dispatch({
      type: "SET_ARTIFACT",
      artifacts: { treatmentBundleId: t.id, treatmentBundleVersion: t.ver },
    });
  };

  const compare = () => setShowCompare(true);

  const continueToAB = () => dispatch({ type: "COMPLETE_STEP", step: "bundles" });

  const changedTools = Object.keys(CURRENT_TOOL_DESCRIPTIONS).filter(
    (k) => CURRENT_TOOL_DESCRIPTIONS[k] !== RECOMMENDED_TOOL_DESCRIPTIONS[k],
  );

  return (
    <div>
      <StepHeader index={8} title={t.steps.bundles.title} lede={t.steps.bundles.lede} learn={t.steps.bundles.learn} />

      <div className="space-y-6">
        <Card eyebrow={t.step6.controlEyebrow} title={t.step6.controlTitle} accent="none">
          <Button variant="secondary" onClick={createControl} disabled={!!control}>
            {control ? t.common.created : t.step6.createControl}
          </Button>
          {control && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 space-y-2">
              <Stat label={t.step6.bundleId} value={control.id} mono truncate />
              <Stat label={t.step6.version} value={control.ver} mono truncate />
              <p className="text-xs text-fog-500">
                commit: <span className="font-mono">Control: original (v1 baseline)</span>
              </p>
            </motion.div>
          )}
        </Card>

        <Card eyebrow={t.step6.treatmentEyebrow} title={t.step6.treatmentTitle} accent="orange">
          <Button onClick={createTreatment} disabled={!!treatment}>
            {treatment ? t.common.created : t.step6.createTreatment}
          </Button>
          {treatment && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 space-y-2">
              <Stat label={t.step6.bundleId} value={treatment.id} mono truncate />
              <Stat label={t.step6.version} value={treatment.ver} mono truncate />
              <p className="text-xs text-fog-500">
                commit:{" "}
                <span className="font-mono">
                  Treatment: AI-recommended prompt + tool descriptions
                </span>
              </p>
            </motion.div>
          )}
        </Card>
      </div>

      {liveErr && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          {liveErr}
        </div>
      )}

      {/* Read + compare */}
      {control && treatment && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
          <Card
            eyebrow={t.step6.compareEyebrow}
            title={t.step6.compareTitle}
            accent="cyan"
            action={
              <Badge variant="cyan" mono>
                {t.step6.keysChanged(changedTools.length + 1)}
              </Badge>
            }
          >
            {!showCompare ? (
              <Button variant="secondary" onClick={compare}>
                {t.step6.compareBtn}
              </Button>
            ) : (
              <div className="space-y-5">
                <div>
                  <div className="eyebrow mb-2">system_prompt</div>
                  <DiffView
                    before={CURRENT_SYSTEM_PROMPT}
                    after={RECOMMENDED_SYSTEM_PROMPT}
                    beforeLabel={`Control · ${control.ver}`}
                    afterLabel={`Treatment · ${treatment.ver}`}
                  />
                </div>
                <div>
                  <div className="eyebrow mb-2">
                    tool_descriptions · {t.step6.toolsChanged(changedTools.length)}
                  </div>
                  <div className="space-y-3">
                    {changedTools.map((name) => (
                      <div key={name}>
                        <Badge variant="orange" mono className="mb-1.5">
                          {name}
                        </Badge>
                        <DiffView
                          before={CURRENT_TOOL_DESCRIPTIONS[name]}
                          after={RECOMMENDED_TOOL_DESCRIPTIONS[name]}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-end border-t border-line/60 pt-4">
                  <Button onClick={continueToAB} disabled={state.status.bundleAB !== "locked"}>
                    {state.status.bundleAB === "locked"
                      ? t.step6.continueBtn
                      : t.step6.continued}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </motion.div>
      )}
    </div>
  );
}
