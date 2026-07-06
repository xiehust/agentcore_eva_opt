import { motion } from "framer-motion";
import { Card, Stat, Badge, Button, CodeBlock } from "./ui";
import { useJourney } from "../state/journey";
import { useLang } from "../i18n/lang";
import { LangToggle } from "../i18n";

const SAMPLE_SNIPPET = `import boto3

agentcore = boto3.client("bedrock-agentcore")
agentcore.invoke_agent_runtime(
    agentRuntimeArn=AGENT_ARN,
    runtimeSessionId=session_id,
    payload=json.dumps({"prompt": prompt}).encode(),
)`;

/** The entry screen. "Start the journey" dispatches START_JOURNEY. */
export function Landing() {
  const { dispatch } = useJourney();
  const { t } = useLang();
  const start = () => dispatch({ type: "START_JOURNEY" });

  const fade = (delay: number) => ({
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] as const },
  });

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
      <motion.header {...fade(0)} className="relative">
        <div className="eyebrow mb-4 flex items-center gap-3">
          <span className="inline-block h-px w-8 bg-aws-orange" />
          {t.landing.eyebrow}
          <span className="ml-auto">
            <LangToggle />
          </span>
        </div>
        <h1 className="font-display text-4xl font-black leading-[1.05] tracking-tight text-fog-100 sm:text-6xl">
          {t.landing.heroLine1}
          <br />
          <span className="text-aws-orange text-glow-orange">
            {t.landing.heroLine2}
          </span>
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-fog-300 sm:text-lg">
          {t.landing.intro}
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Button size="md" onClick={start}>
            {t.landing.start}
          </Button>
          <Button
            size="md"
            variant="secondary"
            onClick={() => dispatch({ type: "SET_MODE", mode: "live" })}
          >
            {t.landing.openConsole}
          </Button>
          <Badge variant="cyan" dot pulse mono>
            {t.landing.simulationMode}
          </Badge>
          <Badge variant="neutral" mono>
            {t.landing.nineSteps}
          </Badge>
        </div>
      </motion.header>

      <motion.div
        {...fade(0.12)}
        className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <Stat
          label={t.landing.statAgent}
          value={t.landing.statAgentValue}
          hint="Strands · Bedrock"
        />
        <Stat
          label={t.landing.statEvaluators}
          value="13"
          delta={t.landing.statEvaluatorsDelta}
          deltaTone="flat"
        />
        <Stat
          label={t.landing.statRouting}
          value="2"
          hint={t.landing.statRoutingHint}
        />
        <Stat
          label={t.landing.statRuntime}
          value="~45m"
          delta={t.landing.statRuntimeDelta}
          deltaTone="up"
        />
      </motion.div>

      <motion.div {...fade(0.2)} className="mt-8 grid gap-6 lg:grid-cols-5">
        <Card
          eyebrow={t.landing.journeyEyebrow}
          title={t.landing.journeyTitle}
          accent="orange"
          className="lg:col-span-3"
        >
          <ol className="space-y-3">
            {t.landing.journeySteps.map(([k, v], i) => (
              <li key={k} className="flex items-start gap-3">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded border border-line-bright bg-ink-700 font-mono text-xs text-cyan-soft">
                  {i + 1}
                </span>
                <span>
                  <span className="font-semibold text-fog-100">{k}.</span>{" "}
                  <span className="text-fog-300">{v}</span>
                </span>
              </li>
            ))}
          </ol>
        </Card>

        <Card
          eyebrow={t.landing.hoodEyebrow}
          title={t.landing.hoodTitle}
          accent="cyan"
          className="lg:col-span-2"
          action={<Badge variant="cyan" mono>API</Badge>}
        >
          <p className="mb-3 text-sm text-fog-300">{t.landing.hoodBody}</p>
          <CodeBlock
            code={SAMPLE_SNIPPET}
            language="python"
            caption="bedrock-agentcore · invoke_agent_runtime"
          />
        </Card>
      </motion.div>

      <footer className="mt-14 border-t border-line/60 pt-6 text-xs text-fog-600">
        {t.landing.footer}
      </footer>
    </div>
  );
}
