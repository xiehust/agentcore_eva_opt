import { useState } from "react";
import { motion } from "framer-motion";
import { Card, Stat, Badge } from "../components/ui";
import { AsyncRunButton } from "../components/AsyncRunButton";
import { LiveRunButton } from "../components/LiveRunButton";
import { useJourney } from "../state/journey";
import { useLiveApi } from "../lib/useLiveApi";
import { StepHeader } from "./StepScaffold";
import { useLang } from "../i18n/lang";
import { deployStages, fakeArn, DEFAULT_REGION } from "../sim/engine";

interface DeployJobResult {
  runtime_arn: string;
  runtime_id: string;
  log_group: string;
  service_name: string;
}

interface DeployResult {
  agentArn: string;
  agentId: string;
  logGroup: string;
  serviceName: string;
}

/** Step 2 — animated multi-stage deploy of the v1 agent to AgentCore Runtime. */
export function Step2Deploy() {
  const { state, dispatch } = useJourney();
  const { t } = useLang();
  const { api, isLive, creds } = useLiveApi();
  const suffix = state.artifacts.suffix ?? "------";
  const v1Name = state.artifacts.v1Name ?? `HRAssistV1${suffix}`;
  const [result, setResult] = useState<DeployResult | null>(
    state.artifacts.agentArn
      ? {
          agentArn: state.artifacts.agentArn,
          agentId: state.artifacts.agentId ?? "",
          logGroup: state.artifacts.logGroup ?? "",
          serviceName: state.artifacts.serviceName ?? "",
        }
      : null,
  );

  const buildResult = (): DeployResult => {
    const agentId = `${v1Name}-${suffix}`.toLowerCase();
    return {
      agentArn: fakeArn("bedrock-agentcore", "runtime", agentId),
      agentId,
      logGroup: `/aws/bedrock-agentcore/runtimes/${agentId}`,
      serviceName: v1Name,
    };
  };

  const onComplete = (r: DeployResult) => {
    setResult(r);
    dispatch({
      type: "COMPLETE_STEP",
      step: "deploy",
      artifacts: {
        agentArn: r.agentArn,
        agentId: r.agentId,
        logGroup: r.logGroup,
        serviceName: r.serviceName,
      },
    });
  };

  // Live: call the backend deploy endpoint and poll the job to its real result.
  const runLiveDeploy = async (onProgress: (m: string) => void) => {
    const { jobId } = await api.deploy({ name: v1Name, version: "v1", creds });
    const job = await api.pollJob<DeployJobResult>(jobId, {
      onProgress: (s) => onProgress(s.progress ?? s.state),
    });
    onComplete({
      agentArn: job.runtime_arn,
      agentId: job.runtime_id,
      logGroup: job.log_group,
      serviceName: job.service_name,
    });
    return job;
  };

  return (
    <div>
      <StepHeader index={2} title={t.steps.deploy.title} lede={t.steps.deploy.lede} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          eyebrow={t.step2.deployEyebrow}
          title={t.step2.deployTitle}
          accent="orange"
          action={<Badge variant="neutral" mono>{v1Name}</Badge>}
        >
          {isLive ? (
            <LiveRunButton
              label={t.step2.deployBtnLive}
              doneLabel={t.step2.deployed}
              run={runLiveDeploy}
            />
          ) : (
            <AsyncRunButton<DeployResult>
              label={t.step2.deployBtn}
              doneLabel={t.step2.deployed}
              stages={deployStages("v1")}
              result={buildResult}
              onComplete={onComplete}
            />
          )}
        </Card>

        <Card eyebrow={t.step2.runtimeEyebrow} title={t.step2.runtimeTitle} accent="cyan">
          {result ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-3"
            >
              <Stat label={t.step2.arn} value={result.agentArn} mono truncate />
              <div className="grid gap-3 sm:grid-cols-2">
                <Stat label={t.step2.serviceName} value={result.serviceName} mono truncate />
                <Stat label={t.step2.region} value={DEFAULT_REGION} mono />
              </div>
              <Stat label={t.step2.logGroup} value={result.logGroup} mono truncate />
              <Badge variant="ok" dot>
                {t.step2.active}
              </Badge>
            </motion.div>
          ) : (
            <p className="text-sm text-fog-500">
              {t.step2.emptyHint}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
