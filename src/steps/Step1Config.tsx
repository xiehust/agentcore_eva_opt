import { useState } from "react";
import { motion } from "framer-motion";
import { Card, Stat, Badge, Button } from "../components/ui";
import { useJourney } from "../state/journey";
import { StepHeader } from "./StepScaffold";
import { useLang } from "../i18n/lang";
import { makeSuffix, FAKE_ACCOUNT_ID, DEFAULT_REGION } from "../sim/engine";

/** Step 1 — generate a unique suffix and derive the v1/v2 runtime names. */
export function Step1Config() {
  const { state, dispatch } = useJourney();
  const { t } = useLang();
  const isLive = state.mode === "live";
  const acct = isLive ? (state.liveIdentity?.account ?? "IAM role") : FAKE_ACCOUNT_ID;
  const region = isLive ? (state.liveIdentity?.region ?? DEFAULT_REGION) : DEFAULT_REGION;
  const [suffix, setSuffix] = useState<string | undefined>(state.artifacts.suffix);

  const v1 = suffix ? `HRAssistV1${suffix}` : undefined;
  const v2 = suffix ? `HRAssistV2${suffix}` : undefined;

  const generate = () => {
    const next = makeSuffix();
    setSuffix(next);
    dispatch({
      type: "COMPLETE_STEP",
      step: "config",
      artifacts: {
        suffix: next,
        v1Name: `HRAssistV1${next}`,
        v2Name: `HRAssistV2${next}`,
      },
    });
  };

  return (
    <div>
      <StepHeader index={1} title={t.steps.config.title} lede={t.steps.config.lede} learn={t.steps.config.learn} />

      <div className="space-y-6">
        <Card eyebrow={t.step1.identityEyebrow} title={t.step1.identityTitle} accent="cyan">
          <div className="grid grid-cols-2 gap-3">
            <Stat label={t.step1.account} value={acct} mono truncate />
            <Stat label={t.step1.region} value={region} mono />
          </div>
          <p className="mt-3 text-xs text-fog-500">
            {isLive ? t.step1.liveNote : t.step1.simNote}
          </p>
        </Card>

        <Card eyebrow={t.step1.runEyebrow} title={t.step1.runTitle} accent="orange">
          <Button onClick={generate} disabled={!!suffix}>
            {suffix ? t.step1.generated : t.step1.generate}
          </Button>

          {suffix && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 space-y-3"
            >
              <div className="flex items-center gap-2">
                <span className="eyebrow">suffix</span>
                <Badge variant="orange" mono>
                  {suffix}
                </Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Stat label={t.step1.v1Name} value={v1} mono truncate />
                <Stat label={t.step1.v2Name} value={v2} mono truncate />
              </div>
            </motion.div>
          )}
        </Card>
      </div>
    </div>
  );
}
