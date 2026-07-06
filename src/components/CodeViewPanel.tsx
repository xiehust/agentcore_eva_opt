import { AnimatePresence, motion } from "framer-motion";
import { CodeBlock } from "./ui";
import { CODE_SNIPPETS, type StepKey } from "../data/codeSnippets";

const CAPTIONS: Record<StepKey, string> = {
  config: "Unique suffix + runtime naming",
  deploy: "deploy_agent → create_agent_runtime",
  baseline: "create_configuration_bundle + invoke_agent_runtime",
  eval: "start_batch_evaluation / get_batch_evaluation",
  insights: "start_batch_evaluation with insights= (failure / intent / execution)",
  recommend: "start_recommendation (system prompt + tool descriptions)",
  bundles: "create / get / get_version configuration_bundle",
  bundleAB: "create_gateway + create_ab_test (config-bundle variants)",
  targetAB: "deploy v2 + create_ab_test (target variants, 90/10)",
  cleanup: "delete_* teardown calls",
};

/**
 * Slide-down panel showing the boto3 snippet behind the active step. Toggled
 * from the StepShell header.
 */
export function CodeViewPanel({
  step,
  open,
}: {
  step: StepKey;
  open: boolean;
}) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key={step}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
          data-testid="code-view-panel"
        >
          <div className="pt-4">
            <CodeBlock
              code={CODE_SNIPPETS[step]}
              language="python"
              caption={`boto3 · ${CAPTIONS[step]}`}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
