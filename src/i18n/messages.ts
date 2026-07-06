/**
 * Bilingual message catalog (zh default, en). Narrative UI text is translated;
 * technical/log-style content — API names, code snippets, ARNs, terminal
 * statuses (ACTIVE/READY), sim stage logs — intentionally stays in English,
 * the way AWS consoles localize.
 *
 * Both locales implement the same `Messages` interface, so a missing key in
 * either language is a compile error.
 */
import type { StepKey } from "../data/codeSnippets";

export type Lang = "zh" | "en";

export interface StepMeta {
  title: string;
  shortTitle: string;
  lede: string;
}

export interface Messages {
  landing: {
    eyebrow: string;
    heroLine1: string;
    heroLine2: string;
    intro: string;
    start: string;
    simulationMode: string;
    nineSteps: string;
    statAgent: string;
    statAgentValue: string;
    statEvaluators: string;
    statEvaluatorsDelta: string;
    statRouting: string;
    statRoutingHint: string;
    statRuntime: string;
    statRuntimeDelta: string;
    journeyEyebrow: string;
    journeyTitle: string;
    journeySteps: [string, string][];
    hoodEyebrow: string;
    hoodTitle: string;
    hoodBody: string;
    footer: string;
    openConsole: string;
  };
  shell: {
    appTitle: string;
    acct: string;
    live: string;
    simulation: string;
    complete: (done: number, total: number) => string;
    reset: string;
    showCode: string;
    hideCode: string;
  };
  auth: {
    title: string;
    passwordLabel: string;
    signIn: string;
    signingIn: string;
    wrongPassword: string;
    unreachable: string;
    hint: string;
  };
  banner: {
    warning: string;
    account: string;
    goToCleanup: string;
  };
  mode: { sim: string; live: string; groupLabel: string };
  creds: {
    eyebrow: string;
    title: string;
    notConnected: string;
    configure: string;
    hide: string;
    useRole: string;
    useKeys: string;
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
    region: string;
    regionOptional: string;
    test: string;
    testing: string;
    neverStored: string;
    cannotReach: string;
    identityFailed: string;
  };
  common: {
    running: string;
    retry: string;
    sending: string;
    sent: string;
    created: string;
    creating: string;
    generated: string;
    analysing: string;
    pending: string;
    sessions: (n: number, total: number) => string;
  };
  stepLabel: (index: number) => string;
  steps: Record<StepKey, StepMeta>;
  step1: {
    identityEyebrow: string;
    identityTitle: string;
    account: string;
    region: string;
    liveNote: string;
    simNote: string;
    runEyebrow: string;
    runTitle: string;
    generate: string;
    generated: string;
    v1Name: string;
    v2Name: string;
  };
  step2: {
    deployEyebrow: string;
    deployTitle: string;
    deployBtn: string;
    deployBtnLive: string;
    deployed: string;
    runtimeEyebrow: string;
    runtimeTitle: string;
    arn: string;
    serviceName: string;
    region: string;
    logGroup: string;
    active: string;
    emptyHint: string;
  };
  step3: {
    bundleEyebrow: string;
    bundleTitle: string;
    createBtn: string;
    createBtnLive: string;
    bundleId: string;
    version: string;
    bundleArn: string;
    trafficEyebrow: string;
    trafficTitle: string;
    sendBtn: string;
    sendBtnLive: string;
    waitingIngest: (s: number) => string;
    ingested: string;
    logEyebrow: string;
    logTitle: string;
    logEmpty: string;
  };
  step4: {
    evalEyebrow: string;
    evalTitle: string;
    startBtn: string;
    startBtnLive: string;
    evaluated: string;
    runHint: (n: number) => string;
    pickerEyebrow: string;
    pickerTitle: string;
    pickerSelected: (n: number) => string;
    pickerHint: string;
    default: string;
    customTag: string;
    showCustomCode: string;
    hideCustomCode: string;
    scoresEyebrow: string;
    scoresTitle: string;
    baselineCaptured: string;
    emptyHint: string;
    levels: { SESSION: string; TRACE: string; TOOL_CALL: string };
  };
  stepInsights: {
    runEyebrow: string;
    runTitle: string;
    startBtn: string;
    analyzed: string;
    runHint: (sessions: number) => string;
    typesEyebrow: string;
    typesTitle: string;
    typeFailure: string;
    typeIntent: string;
    typeExecution: string;
    exclusiveNote: string;
    resultsEyebrow: string;
    resultsTitle: string;
    failureBadge: (n: number) => string;
    failuresTitle: string;
    recommendation: string;
    sessionCount: (n: number) => string;
    intentsTitle: string;
    executionTitle: string;
    continueBtn: string;
    bridgeNote: string;
    emptyHint: string;
  };
  step5: {
    spEyebrow: string;
    spTitle: string;
    spBtn: string;
    spBtnLive: string;
    tdEyebrow: string;
    tdTitle: string;
    tdBtn: string;
    tdBtnLive: string;
    currentPrompt: string;
    recommendedPrompt: string;
    before: string;
    after: string;
    acceptTitle: string;
    acceptBody: string;
    acceptBtn: string;
    accepted: string;
  };
  step6: {
    controlEyebrow: string;
    controlTitle: string;
    createControl: string;
    treatmentEyebrow: string;
    treatmentTitle: string;
    createTreatment: string;
    bundleId: string;
    version: string;
    compareEyebrow: string;
    compareTitle: string;
    keysChanged: (n: number) => string;
    compareBtn: string;
    toolsChanged: (n: number) => string;
    continueBtn: string;
    continued: string;
  };
  step7: {
    setupEyebrow: string;
    setupTitle: string;
    setupBtn: string;
    setupBtnLive: string;
    setupDone: string;
    trafficEyebrow: string;
    trafficTitle: string;
    sendBtn: string;
    sendBtnLive: string;
    stickyHint: string;
    resultsEyebrow: string;
    resultsTitle: string;
    monitorBtn: string;
    monitorBtnLive: string;
    resultsReady: string;
    analysed: string;
    controlLabel: string;
    treatmentLabel: string;
    promoteEyebrow: string;
    promoteWinTitle: string;
    promoteTitle: string;
    t1Wins: string;
    noImprovement: string;
    mixed: string;
    promoteBody: string;
    promoteBtn: string;
    promoteAnywayBtn: string;
    promoted: string;
    prevVersion: string;
    newVersion: string;
  };
  step8: {
    comparisonEyebrow: string;
    comparisonTitle: string;
    configBundleCol: string;
    targetBasedCol: string;
    routingRows: { dimension: string; configBundle: string; targetBased: string }[];
    deployEyebrow: string;
    deployTitle: string;
    deployBtn: string;
    deployBtnLive: string;
    deployed: string;
    v2Arn: string;
    v2ToolNote: (tool: string) => string;
    canaryEyebrow: string;
    canaryTitle: string;
    setupBtn: string;
    setupBtnLive: string;
    canaryLive: string;
    sendBtn: (n: number) => string;
    sendBtnLive: (n: number) => string;
    resultsEyebrow: string;
    resultsTitle: string;
    monitorBtn: string;
    monitorBtnLive: string;
    resultsReady: string;
    v1Label: string;
    v2Label: string;
    rolloutEyebrow: string;
    rolloutTitle: string;
    rollout: { canary: string; ramp: string; full: string };
    rolloutNotes: { canary: string; ramp: string; full: string };
    rampBtn: (w: number) => string;
    fullyRolledOut: string;
  };
  step9: {
    teardownEyebrow: string;
    teardownTitle: string;
    categories: (n: number) => string;
    allDeleted: string;
    runBtn: string;
    done: string;
    cleanupItems: Record<string, { label: string; detail: string }>;
    recapEyebrow: string;
    recapTitle: string;
    colStep: string;
    colAction: string;
    colApi: string;
    summaryActions: Record<string, string>;
    recapEmpty: string;
    takeawaysEyebrow: string;
    takeawaysTitle: string;
    takeaways: { title: string; body: string }[];
  };
  evaluators: {
    labels: Record<string, string>;
    descriptions: Record<string, string>;
    customDescription: string;
  };
  verdict: {
    win: (scope: string, summary: string) => string;
    loss: (scope: string, summary: string) => string;
    mixed: (improved: number, total: number, summary: string) => string;
    bothMetrics: string;
    allMetrics: (n: number) => string;
    eitherMetric: string;
    anyMetric: string;
    significant: string;
    notSignificant: string;
  };
  console: {
    title: string;
    subtitle: string;
    nav: {
      agents: string;
      datasets: string;
      evaluators: string;
      runs: string;
      insights: string;
      experiments: string;
      cleanup: string;
    };
    common: {
      name: string;
      description: string;
      save: string;
      cancel: string;
      delete: string;
      confirmDelete: string;
      edit: string;
      back: string;
      refresh: string;
      loading: string;
      uploadFile: string;
      updated: string;
      error: string;
    };
    agents: {
      title: string;
      eyebrow: string;
      newBlank: string;
      newFromSample: string;
      newFromSampleV2: string;
      newFromSampleZh: string;
      uploadPy: string;
      code: string;
      requirements: string;
      requirementsHint: string;
      baseDeps: string;
      deploy: string;
      deploying: string;
      deployed: string;
      notDeployed: string;
      deployFailed: string;
      undeploy: string;
      runtimeArn: string;
      logGroup: string;
      serviceName: string;
      region: string;
      empty: string;
      runWithAgent: string;
      deployHint: string;
      editorLoading: string;
      nameRequired: string;
      codeRequired: string;
    };
    datasets: {
      title: string;
      eyebrow: string;
      newBlank: string;
      newFromSample: string;
      fromSample: (name: string) => string;
      upload: string;
      itemCount: (n: number) => string;
      prompt: string;
      context: string;
      contextHint: string;
      addRow: string;
      removeRow: string;
      formatHint: string;
      invalidFile: (err: string) => string;
      empty: string;
      itemsRequired: string;
      download: string;
    };
    evaluators: {
      title: string;
      builtinEyebrow: string;
      customEyebrow: string;
      createTitle: string;
      instructions: string;
      modelId: string;
      level: string;
      ratingScale: string;
      scaleValue: string;
      scaleLabel: string;
      scaleDefinition: string;
      addPoint: string;
      prefillSample: string;
      createBtn: string;
      noCustom: string;
      loadFailed: string;
      levelOf: (level: string) => string;
    };
    runs: {
      title: string;
      newRunEyebrow: string;
      newRunTitle: string;
      historyEyebrow: string;
      historyTitle: string;
      pickAgent: string;
      pickDataset: string;
      pickEvaluators: string;
      onlyDeployedHint: string;
      noDeployedAgents: string;
      noDatasets: string;
      startBtn: string;
      startedHint: string;
      status: {
        pending: string;
        invoking: string;
        waiting: string;
        evaluating: string;
        completed: string;
        failed: string;
      };
      scoresEyebrow: string;
      sessions: (n: number) => string;
      emptyHistory: string;
      batchId: string;
      selectRun: string;
      triageBtn: string;
    };
    insights: {
      newEyebrow: string;
      newTitle: string;
      intro: string;
      pickAgent: string;
      scope: string;
      scopes: { run: string; lookback: string };
      pickRun: string;
      noRuns: string;
      lookbackLabel: string;
      lookbackUnit: string;
      pickInsights: string;
      types: Record<string, string>;
      startBtn: string;
      startedHint: string;
      historyEyebrow: string;
      historyTitle: string;
      emptyHistory: string;
      sourceRun: string;
      sourceLookback: string;
      status: {
        pending: string;
        analyzing: string;
        completed: string;
        failed: string;
      };
      reportEyebrow: string;
      resume: string;
      failuresTitle: string;
      noFailures: string;
      recommendation: string;
      sessionCount: (n: number) => string;
      toExperimentsHint: string;
      intentsTitle: string;
      executionTitle: string;
    };
    agentConfig: {
      eyebrow: string;
      systemPrompt: string;
      toolDescriptions: string;
      toolName: string;
      toolDesc: string;
      addTool: string;
      removeTool: string;
      hint: string;
      missing: string;
    };
    experiments: {
      title: string;
      eyebrow: string;
      empty: string;
      createTitle: string;
      namePlaceholder: string;
      pickAgent: string;
      noConfigWarning: string;
      create: string;
      open: string;
      stages: {
        recommend: string;
        bundles: string;
        abtest: string;
        monitor: string;
        promoted: string;
        canary: string;
        canary_monitor: string;
        done: string;
      };
      resume: string;
      resumeHint: string;
      recommend: {
        title: string;
        hintNeedsTraces: string;
        spBtn: string;
        tdBtn: string;
        usedFallback: string;
        currentLabel: string;
        recommendedLabel: string;
        acceptBtn: string;
        editHint: string;
      };
      bundles: {
        title: string;
        controlLabel: string;
        treatmentLabel: string;
        createBtn: string;
        hookNote: string;
      };
      abtest: {
        setupTitle: string;
        setupBtn: string;
        trafficTitle: string;
        pickDataset: string;
        noDatasets: string;
        sendBtn: string;
        monitorTitle: string;
        monitorBtn: string;
        aggregationHint: string;
        controlLabel: string;
        treatmentLabel: string;
        promoteTitle: string;
        promoteBtn: string;
        promoted: string;
      };
      canary: {
        title: string;
        skipBtn: string;
        pickChallenger: string;
        noChallenger: string;
        setupBtn: string;
        trafficTitle: string;
        monitorTitle: string;
        v1Label: string;
        v2Label: string;
        weightsTitle: string;
        setWeight: (w: number) => string;
        currentWeight: (w: number) => string;
        rolloutHint: string;
      };
      doneTitle: string;
      doneBody: string;
      goCleanup: string;
    };
    cleanup: {
      title: string;
      eyebrow: string;
      empty: string;
      resources: string;
      noResources: string;
      teardownBtn: string;
      teardownDone: string;
      resultsDeleted: (n: number, total: number) => string;
      undeployHint: string;
      deleteRecordBtn: string;
      cleanedAt: string;
    };
  };
}

// ─── English ─────────────────────────────────────────────────────────────────
export const en: Messages = {
  landing: {
    eyebrow: "Amazon Bedrock AgentCore · Lab 4",
    heroLine1: "Agent Optimization,",
    heroLine2: "end to end.",
    intro:
      "An interactive, fully-simulated walkthrough of the AgentCore optimization journey — deploy an HR Assistant, measure it, let the platform recommend improvements, then A/B test your way to a better agent. No AWS account required.",
    start: "Start the journey →",
    simulationMode: "simulation mode",
    nineSteps: "10 steps",
    statAgent: "Agent",
    statAgentValue: "HR Assistant",
    statEvaluators: "Built-in evaluators",
    statEvaluatorsDelta: "+ custom LLM judge",
    statRouting: "A/B routing modes",
    statRoutingHint: "config-bundle · target",
    statRuntime: "Est. live runtime",
    statRuntimeDelta: "→ seconds here",
    journeyEyebrow: "The journey",
    journeyTitle: "From baseline to better",
    journeySteps: [
      ["Configure", "Generate a unique run suffix and runtime names"],
      ["Deploy", "Ship the HR Assistant to AgentCore Runtime"],
      ["Baseline", "Create the baseline bundle, send traffic, capture traces"],
      ["Evaluate", "Score goal success, helpfulness, correctness"],
      ["Triage", "Insights explain WHY sessions fail and what users want"],
      ["Recommend", "Auto-improve the system prompt & tool descriptions"],
      ["Bundle", "Package control & treatment configuration bundles"],
      ["Bundle A/B", "Split traffic 50/50 across configs on one runtime"],
      ["Canary A/B", "Route 90/10 to a v2 runtime, ramp on wins"],
      ["Clean up", "Tear down every resource the journey created"],
    ],
    hoodEyebrow: "Under the hood",
    hoodTitle: "Real boto3, every step",
    hoodBody:
      "Each simulated step reveals the exact AWS SDK call it stands in for — so this doubles as an API reference.",
    footer:
      "Simulation of AWS Bedrock AgentCore Lab 4 · all identifiers are fabricated · no real AWS resources are created.",
    openConsole: "Open Live console →",
  },
  shell: {
    appTitle: "AgentCore Optimization",
    acct: "acct",
    live: "live",
    simulation: "simulation",
    complete: (d, t) => `${d}/${t} complete`,
    reset: "Reset journey",
    showCode: "▸ Show code view",
    hideCode: "▾ Hide code view",
  },
  auth: {
    title: "AgentCore Optimization Console",
    passwordLabel: "Access password",
    signIn: "Sign in",
    signingIn: "Signing in…",
    wrongPassword: "Incorrect password.",
    unreachable: "Backend unreachable — try again.",
    hint: "This deployment is password-protected. The session lasts 12 hours and is kept in an HttpOnly cookie.",
  },
  banner: {
    warning: "⚡ Live mode — real AWS resources, incurs cost",
    account: "account",
    goToCleanup: "→ Go to cleanup",
  },
  mode: { sim: "Simulation", live: "⚡ Live AWS", groupLabel: "Execution mode" },
  creds: {
    eyebrow: "Live connection",
    title: "AWS credentials",
    notConnected: "not connected",
    configure: "▸ Configure credentials",
    hide: "▾ Hide credential options",
    useRole: "Use EC2 IAM role (default — no keys needed)",
    useKeys: "Provide access keys (session only)",
    accessKeyId: "Access key ID",
    secretAccessKey: "Secret access key",
    sessionToken: "Session token (optional)",
    region: "Region",
    regionOptional: "Region (optional)",
    test: "Test connection",
    testing: "Testing…",
    neverStored:
      "Credentials are used only for this session and are never stored on disk or in the browser's local storage.",
    cannotReach: "Cannot reach backend",
    identityFailed: "identity check failed",
  },
  common: {
    running: "Running…",
    retry: "↻ Retry",
    sending: "Sending…",
    sent: "Sent ✓",
    created: "Created ✓",
    creating: "Creating…",
    generated: "generated",
    analysing: "Analysing results…",
    pending: "pending",
    sessions: (n, t) => `${n}/${t} sessions`,
  },
  stepLabel: (i) => `Step ${i}`,
  steps: {
    config: {
      title: "Configuration",
      shortTitle: "Configure",
      lede: "Every run gets a unique random suffix so repeated journeys never collide. The runtime names are derived from it — one for the v1 agent, one for the v2 canary you'll deploy later.",
    },
    deploy: {
      title: "Deploy HR Assistant v1",
      shortTitle: "Deploy v1",
      lede: "The deploy script builds an ARM64 container from the agent code, creates an IAM execution role, uploads to S3, then creates an AgentCore Runtime and polls until it reports ACTIVE. Live this takes 3–5 minutes; here it's compressed to seconds.",
    },
    baseline: {
      title: "Baseline Bundle & Traffic",
      shortTitle: "Baseline",
      lede: "A Configuration Bundle is a versioned container for the agent's system prompt and tool descriptions, read at invocation time — no redeploy needed. We create a baseline bundle, then send 10 representative HR sessions whose traces feed evaluation and recommendations next.",
    },
    eval: {
      title: "Baseline Batch Evaluation",
      shortTitle: "Evaluate",
      lede: "Batch evaluation discovers the sessions you just sent from CloudWatch, runs each through built-in LLM evaluators, and returns aggregate scores. These become the baseline you'll try to beat with A/B testing.",
    },
    insights: {
      title: "Failure Insights",
      shortTitle: "Insights",
      lede: "Scores tell you THAT the agent underperforms — insights tell you WHY. The same batch-evaluation API, given insights instead of evaluators, triages every session: failure patterns with root causes and fixes, what users were trying to do, and how the agent behaved. These findings feed the recommendations next.",
    },
    recommend: {
      title: "Optimization Recommendations",
      shortTitle: "Recommend",
      lede: "AgentCore analyses your production traces and proposes improved configuration. A system-prompt recommendation rewrites your prompt to lift a target metric; a tool-description recommendation sharpens each tool's description so the model picks the right tool more often.",
    },
    bundles: {
      title: "Configuration Bundles",
      shortTitle: "Bundles",
      lede: "A Configuration Bundle is a versioned, immutable container of agent config keyed by runtime ARN. We package two: a control (original) and a treatment (the recommendations you accepted). Every create/update yields a new version you can read back or roll back to.",
    },
    bundleAB: {
      title: "A/B Test — Config Bundle Routing",
      shortTitle: "Bundle A/B",
      lede: "When the change is pure configuration — a different prompt or tool descriptions — both variants run on one runtime. The gateway injects the right configuration bundle per request via W3C baggage headers, sticky per session. Deploy one runtime, one eval config, and split the traffic.",
    },
    targetAB: {
      title: "A/B Test — Target-Based Routing",
      shortTitle: "Target A/B",
      lede: "When the change is code — a new tool, a framework upgrade, a different implementation — route across two separate runtimes. We deploy v2 (it adds an escalation tool and an improved baked-in prompt), then canary it: 10% of traffic to v2, evaluated by its own config, ramping up only if metrics hold.",
    },
    cleanup: {
      title: "Cleanup",
      shortTitle: "Cleanup",
      lede: "Tear down every resource the journey created. Each category is deleted independently, so a partial run still cleans up what it can.",
    },
  },
  stepInsights: {
    runEyebrow: "Triage",
    runTitle: "Run insights analysis",
    startBtn: "Run insights analysis",
    analyzed: "Analyzed",
    runHint: (sessions) =>
      `Analyzes the ${sessions} baseline sessions with LLM triage, then clusters findings across sessions into failure patterns, intents, and behaviors.`,
    typesEyebrow: "Insight types",
    typesTitle: "Three analyses",
    typeFailure: "failure categories → subcategories → root causes, each with a suggested fix.",
    typeIntent: "what users were trying to accomplish, clustered and ranked by frequency.",
    typeExecution: "how the agent approached each session and what the outcome was.",
    exclusiveNote:
      "insights= and evaluators= are mutually exclusive in start_batch_evaluation — triage and scoring are separate jobs, and only one batch evaluation can be active per account.",
    resultsEyebrow: "Findings",
    resultsTitle: "Triage report",
    failureBadge: (n) => `failures in ${n} sessions`,
    failuresTitle: "Failure patterns (categories → subcategories → root causes)",
    recommendation: "Suggested fix",
    sessionCount: (n) => `${n} session${n === 1 ? "" : "s"}`,
    intentsTitle: "User intents (most common asks)",
    executionTitle: "Execution patterns (how the agent solves problems)",
    continueBtn: "Continue to recommendations →",
    bridgeNote:
      "These root causes are exactly what the next step fixes: the recommendation engine reads the same traces and rewrites the system prompt and tool descriptions to address them.",
    emptyHint:
      "Run the analysis to reveal failure patterns, user intents, and execution behavior for the baseline sessions.",
  },
  step1: {
    identityEyebrow: "Identity",
    identityTitle: "Account & region",
    account: "AWS account",
    region: "Region",
    liveNote: "Live account — real AWS resources will be created.",
    simNote: "Fabricated values — no real AWS account is contacted.",
    runEyebrow: "Run config",
    runTitle: "Generate a unique suffix",
    generate: "Generate configuration",
    generated: "Generated ✓",
    v1Name: "v1 runtime name",
    v2Name: "v2 runtime name",
  },
  step2: {
    deployEyebrow: "Deployment",
    deployTitle: "Build & launch runtime",
    deployBtn: "Deploy HR Assistant v1",
    deployBtnLive: "Deploy HR Assistant v1 (real)",
    deployed: "Deployed",
    runtimeEyebrow: "Runtime",
    runtimeTitle: "Created resources",
    arn: "Agent runtime ARN",
    serviceName: "Service name",
    region: "Region",
    logGroup: "CloudWatch log group",
    active: "Runtime ACTIVE",
    emptyHint:
      "Run the deployment to populate the runtime ARN, log group, and service name.",
  },
  step3: {
    bundleEyebrow: "Step 3a",
    bundleTitle: "Baseline configuration bundle",
    createBtn: "Create baseline bundle",
    createBtnLive: "Create baseline bundle (real)",
    bundleId: "Bundle ID",
    version: "Version",
    bundleArn: "Bundle ARN",
    trafficEyebrow: "Step 3b",
    trafficTitle: "Send baseline traffic",
    sendBtn: "Send 10 sessions",
    sendBtnLive: "Send 10 sessions (real)",
    waitingIngest: (s) => `Waiting for CloudWatch ingestion… ${s}s`,
    ingested: "Traces ingested",
    logEyebrow: "Traffic",
    logTitle: "Session log",
    logEmpty:
      "No sessions yet. Create the bundle, then send traffic to stream the 10 representative HR prompts here.",
  },
  step4: {
    evalEyebrow: "Evaluation",
    evalTitle: "Run batch evaluation",
    startBtn: "Start batch evaluation",
    startBtnLive: "Start batch evaluation (real)",
    evaluated: "Evaluated",
    runHint: (n) =>
      `Discovers sessions, scores each with the ${n} selected evaluators, then aggregates per-evaluator means.`,
    pickerEyebrow: "Evaluators",
    pickerTitle: "Choose evaluators",
    pickerSelected: (n) => `${n} selected`,
    pickerHint:
      "The default trio always runs. AgentCore ships 13 built-in evaluators across session, trace, and tool-call levels — add any to the baseline.",
    default: "default",
    customTag: "custom · llm judge",
    showCustomCode: "Show custom evaluator code",
    hideCustomCode: "Hide custom evaluator code",
    scoresEyebrow: "Baseline",
    scoresTitle: "Evaluator scores",
    baselineCaptured: "baseline captured",
    emptyHint:
      "Run the evaluation to reveal the selected evaluator scores for the baseline sessions.",
    levels: { SESSION: "session", TRACE: "trace", TOOL_CALL: "tool call" },
  },
  step5: {
    spEyebrow: "Step 6a",
    spTitle: "System prompt recommendation",
    spBtn: "Generate system-prompt recommendation",
    spBtnLive: "Generate system-prompt recommendation (real)",
    tdEyebrow: "Step 6b",
    tdTitle: "Tool description recommendations",
    tdBtn: "Generate tool-description recommendations",
    tdBtnLive: "Generate tool-description recommendations (real)",
    currentPrompt: "Current system prompt",
    recommendedPrompt: "Recommended system prompt",
    before: "Before",
    after: "After",
    acceptTitle: "Accept these recommendations?",
    acceptBody:
      "They'll be packaged into a treatment configuration bundle and A/B tested against the original in the next steps.",
    acceptBtn: "Accept recommendations",
    accepted: "Accepted ✓",
  },
  step6: {
    controlEyebrow: "Control (C)",
    controlTitle: "Original configuration",
    createControl: "Create control bundle",
    treatmentEyebrow: "Treatment (T1)",
    treatmentTitle: "Recommended configuration",
    createTreatment: "Create treatment bundle",
    bundleId: "Bundle ID",
    version: "Version",
    compareEyebrow: "Read & compare",
    compareTitle: "Control vs Treatment — version diff",
    keysChanged: (n) => `${n} keys changed`,
    compareBtn: "Compare versions",
    toolsChanged: (n) => `${n} changed`,
    continueBtn: "Continue to A/B test →",
    continued: "Continued ✓",
  },
  step7: {
    setupEyebrow: "Step 8a–d",
    setupTitle: "Set up gateway & A/B test",
    setupBtn: "Provision gateway + A/B test",
    setupBtnLive: "Provision gateway + A/B test (real)",
    setupDone: "A/B test LIVE",
    trafficEyebrow: "Step 8e",
    trafficTitle: "Send gateway traffic",
    sendBtn: "Send 20 gateway sessions",
    sendBtnLive: "Send 20 gateway sessions (real)",
    stickyHint:
      "Each session is assigned C or T1 by session ID and routed with the matching bundle. Assignment is sticky within a session.",
    resultsEyebrow: "Step 8f",
    resultsTitle: "A/B test results",
    monitorBtn: "Monitor results",
    monitorBtnLive: "Monitor results (real)",
    resultsReady: "Results ready",
    analysed: "analysed",
    controlLabel: "C · original prompt",
    treatmentLabel: "T1 · recommended prompt",
    promoteEyebrow: "Step 8g",
    promoteWinTitle: "Promote the winning config",
    promoteTitle: "Promote decision",
    t1Wins: "T1 wins",
    noImprovement: "no improvement",
    mixed: "mixed",
    promoteBody:
      "Promoting updates the control bundle to the recommended config — recording lineage via",
    promoteBtn: "Promote winner",
    promoteAnywayBtn: "Promote T1 anyway",
    promoted: "Promoted ✓",
    prevVersion: "Previous control version",
    newVersion: "New control version",
  },
  step8: {
    comparisonEyebrow: "When to use which",
    comparisonTitle: "Config-bundle vs target-based routing",
    configBundleCol: "Config-bundle",
    targetBasedCol: "Target-based",
    routingRows: [
      {
        dimension: "What changes",
        configBundle: "System prompt or config (no code change)",
        targetBased: "Agent code, tools, or model",
      },
      {
        dimension: "Deployment",
        configBundle: "No redeployment needed",
        targetBased: "Requires deploying a new runtime",
      },
      {
        dimension: "Runtimes needed",
        configBundle: "One shared runtime",
        targetBased: "Two separate runtimes",
      },
      {
        dimension: "Eval configs needed",
        configBundle: "One shared online eval config",
        targetBased: "One per variant (different log groups)",
      },
      {
        dimension: "Use case",
        configBundle: "Prompt optimization, config tuning",
        targetBased: "Code rollout, version upgrade",
      },
      {
        dimension: "Risk",
        configBundle: "Very low — instant rollback via bundle",
        targetBased: "Higher — binary change",
      },
    ],
    deployEyebrow: "Step 9a",
    deployTitle: "Deploy HR Assistant v2",
    deployBtn: "Deploy v2 (new tool + prompt)",
    deployBtnLive: "Deploy v2 (real — new tool + prompt)",
    deployed: "v2 deployed",
    v2Arn: "v2 runtime ARN",
    v2ToolNote: (tool) =>
      `+ ${tool} — new tool (6 total). Improved system prompt baked into the code.`,
    canaryEyebrow: "Step 9b–d",
    canaryTitle: "Canary A/B test",
    setupBtn: "Set up 90/10 target A/B test",
    setupBtnLive: "Set up 90/10 target A/B test (real)",
    canaryLive: "Canary LIVE",
    sendBtn: (n) => `Send ${n} target sessions`,
    sendBtnLive: (n) => `Send ${n} target sessions (real)`,
    resultsEyebrow: "Step 9e",
    resultsTitle: "Canary results — v1 vs v2",
    monitorBtn: "Monitor canary results",
    monitorBtnLive: "Monitor canary results (real)",
    resultsReady: "Results ready",
    v1Label: "v1 (Control · 90%)",
    v2Label: "v2 (Treatment · 10%)",
    rolloutEyebrow: "Step 9f",
    rolloutTitle: "Phased rollout",
    rollout: { canary: "Canary", ramp: "Ramp", full: "Full" },
    rolloutNotes: {
      canary: "10% to v2 — watch the metrics",
      ramp: "50/50 — confidence building",
      full: "100% on v2 — retire v1",
    },
    rampBtn: (w) => `Ramp to ${w}% →`,
    fullyRolledOut: "Fully rolled out",
  },
  step9: {
    teardownEyebrow: "Teardown",
    teardownTitle: "Delete all resources",
    categories: (n) => `${n} categories`,
    allDeleted: "all deleted",
    runBtn: "Run cleanup",
    done: "Cleanup complete ✓",
    cleanupItems: {
      abtests: { label: "A/B tests", detail: "bundle + target routing tests" },
      onlineeval: {
        label: "Online evaluation configs",
        detail: "v1 + v2 auto-scoring",
      },
      bundles: {
        label: "Configuration bundles",
        detail: "baseline, control, treatment",
      },
      tracing: { label: "Gateway tracing", detail: "X-Ray delivery + source" },
      targets: { label: "Gateway targets", detail: "HRAgentV1, HRAgentV2" },
      gateway: { label: "Gateway", detail: "HTTP gateway + IAM authorizer" },
      runtimes: { label: "Agent runtimes", detail: "v1 + v2 AgentCore runtimes" },
      iam: { label: "IAM execution role", detail: "permissions + trust policy" },
      s3: { label: "S3 artifacts", detail: "deployment bucket objects" },
    },
    recapEyebrow: "Recap",
    recapTitle: "Journey complete",
    colStep: "Step",
    colAction: "Action",
    colApi: "Key API",
    summaryActions: {
      "2": "Deployed HR Assistant to AgentCore Runtime",
      "3": "Created baseline Configuration Bundle and sent traffic",
      "4": "Measured baseline performance",
      "5a": "Generated improved system prompt from traces",
      "5b": "Generated improved tool descriptions",
      "6": "Packaged control and treatment configs",
      "7": "A/B tested config change via config-bundle routing",
      "8": "Canary rollout of v2 via target-based routing",
    },
    recapEmpty:
      "Complete the cleanup to reveal the full journey recap and key takeaways.",
    takeawaysEyebrow: "Key takeaways",
    takeawaysTitle: "How AgentCore optimizes deployed agents",
    takeaways: [
      {
        title: "Observability",
        body: "Collect detailed traces and metrics to drill into the reasoning and tool-calling behind every response.",
      },
      {
        title: "Evaluation",
        body: "Automatically score traces — from goal completion down to helpfulness and correctness.",
      },
      {
        title: "Recommendations",
        body: "Let the platform propose improved system prompts and tool descriptions from observed performance.",
      },
      {
        title: "A/B testing",
        body: "Build confidence that each new deployment consistently improves results before full rollout.",
      },
    ],
  },
  evaluators: {
    labels: {
      "Builtin.GoalSuccessRate": "Goal Success Rate",
      "Builtin.Helpfulness": "Helpfulness",
      "Builtin.Correctness": "Correctness",
      "Builtin.Faithfulness": "Faithfulness",
      "Builtin.ResponseRelevance": "Response Relevance",
      "Builtin.Conciseness": "Conciseness",
      "Builtin.Coherence": "Coherence",
      "Builtin.InstructionFollowing": "Instruction Following",
      "Builtin.Refusal": "Refusal",
      "Builtin.Harmfulness": "Harmfulness",
      "Builtin.Stereotyping": "Stereotyping",
      "Builtin.ToolSelectionAccuracy": "Tool Selection Accuracy",
      "Builtin.ToolParameterAccuracy": "Tool Parameter Accuracy",
    },
    descriptions: {
      "Builtin.GoalSuccessRate": "Did the conversation meet the user's goals?",
      "Builtin.Helpfulness": "Was the response useful and actionable?",
      "Builtin.Correctness": "Did the agent give accurate information?",
      "Builtin.Faithfulness": "Is the response supported by the provided context?",
      "Builtin.ResponseRelevance": "Does the response address the user's query?",
      "Builtin.Conciseness":
        "Appropriately brief without missing key information?",
      "Builtin.Coherence": "Is the response logically structured?",
      "Builtin.InstructionFollowing":
        "Does the agent follow its system instructions?",
      "Builtin.Refusal": "Does the agent evade or refuse answerable questions?",
      "Builtin.Harmfulness": "Does the response contain harmful content?",
      "Builtin.Stereotyping": "Generalizations about individuals or groups?",
      "Builtin.ToolSelectionAccuracy":
        "Did the agent pick the right tool for the task?",
      "Builtin.ToolParameterAccuracy":
        "Were tool parameters extracted correctly?",
    },
    customDescription:
      "Penalizes answers that reveal other employees' data or invent HR policy.",
  },
  verdict: {
    win: (scope, summary) => `T1 improved on ${scope} (${summary}).`,
    loss: (scope, summary) =>
      `T1 did not beat the control on ${scope} (${summary}). You may want more sessions before promoting.`,
    mixed: (improved, total, summary) =>
      `Mixed result — T1 improved on ${improved} of ${total} metrics (${summary}). Promoting is a judgment call.`,
    bothMetrics: "both metrics",
    allMetrics: (n) => `all ${n} metrics`,
    eitherMetric: "either metric",
    anyMetric: "any metric",
    significant: " The improvement is statistically significant.",
    notSignificant: " The difference is not statistically significant.",
  },
  console: {
    title: "Agent Evaluation Console",
    subtitle: "Deploy any agent, run your dataset against it, score it with AgentCore evaluators.",
    nav: {
      agents: "Agents",
      datasets: "Datasets",
      evaluators: "Evaluators",
      runs: "Runs",
      insights: "Insights",
      experiments: "Experiments",
      cleanup: "Cleanup",
    },
    common: {
      name: "Name",
      description: "Description",
      save: "Save",
      cancel: "Cancel",
      delete: "Delete",
      confirmDelete: "Confirm delete",
      edit: "Edit",
      back: "← Back",
      refresh: "Refresh",
      loading: "Loading…",
      uploadFile: "Upload file",
      updated: "Updated",
      error: "Error",
    },
    agents: {
      title: "Agents",
      eyebrow: "Agent code",
      newBlank: "New blank agent",
      newFromSample: "New from HR sample",
      newFromSampleV2: "New from HR v2 sample",
      newFromSampleZh: "New from HR sample (Chinese)",
      uploadPy: "Upload .py",
      code: "Agent code (deployed as main.py)",
      requirements: "Extra pip requirements",
      requirementsHint: "One spec per line, e.g. requests>=2. Must have aarch64 wheels.",
      baseDeps: "Base dependencies (always installed)",
      deploy: "Deploy",
      deploying: "Deploying…",
      deployed: "Deployed",
      notDeployed: "Not deployed",
      deployFailed: "Deploy failed",
      undeploy: "Undeploy",
      runtimeArn: "Runtime ARN",
      logGroup: "Log group",
      serviceName: "Service name",
      region: "Region",
      empty: "No agents yet — create one from the HR sample, a blank template, or upload a .py file.",
      runWithAgent: "Run",
      deployHint: "Deploying builds the package (pip for ARM64), uploads to S3, creates the runtime, and polls to ACTIVE — typically 5–15 minutes.",
      editorLoading: "Loading editor…",
      nameRequired: "Name is required",
      codeRequired: "Agent code is required",
    },
    datasets: {
      title: "Datasets",
      eyebrow: "Evaluation data",
      newBlank: "New blank dataset",
      newFromSample: "New from HR sample",
      fromSample: (name) => `+ ${name.replace(" (sample)", "").replace("(中文样例)", " · 中文")}`,
      upload: "Upload JSON / JSONL",
      itemCount: (n) => `${n} item${n === 1 ? "" : "s"}`,
      prompt: "Prompt",
      context: "Context (optional prefix)",
      contextHint: "Prepended to the prompt when sent, e.g. \"Employee ID: EMP-001.\"",
      addRow: "+ Add row",
      removeRow: "Remove",
      formatHint: "Accepted formats: JSON array of {prompt, context?} or JSONL (one object per line).",
      invalidFile: (err) => `Could not parse file: ${err}`,
      empty: "No datasets yet — create one from the HR sample, a blank table, or upload a file.",
      itemsRequired: "At least one item with a prompt is required",
      download: "Download JSON",
    },
    evaluators: {
      title: "Evaluators",
      builtinEyebrow: "Built-in evaluators",
      customEyebrow: "Custom LLM-judge evaluators",
      createTitle: "Create custom evaluator",
      instructions: "Judge instructions",
      modelId: "Judge model ID",
      level: "Level",
      ratingScale: "Rating scale",
      scaleValue: "Value",
      scaleLabel: "Label",
      scaleDefinition: "Definition",
      addPoint: "+ Add point",
      prefillSample: "Prefill HR sample",
      createBtn: "Create evaluator",
      noCustom: "No custom evaluators yet.",
      loadFailed: "Could not load custom evaluators (AWS credentials required).",
      levelOf: (level) => `Level: ${level}`,
    },
    runs: {
      title: "Runs",
      newRunEyebrow: "New evaluation run",
      newRunTitle: "Deploy traffic + batch evaluation",
      historyEyebrow: "History",
      historyTitle: "Past runs",
      pickAgent: "Agent",
      pickDataset: "Dataset",
      pickEvaluators: "Evaluators",
      onlyDeployedHint: "Only deployed agents can be evaluated.",
      noDeployedAgents: "No deployed agents — deploy one on the Agents page first.",
      noDatasets: "No datasets — create one on the Datasets page first.",
      startBtn: "Start run",
      startedHint: "Sends one session per dataset item, waits for traces to land in CloudWatch, then runs batch evaluation — several minutes end to end.",
      status: {
        pending: "Pending",
        invoking: "Sending traffic",
        waiting: "Waiting for traces",
        evaluating: "Evaluating",
        completed: "Completed",
        failed: "Failed",
      },
      scoresEyebrow: "Scores",
      sessions: (n) => `${n} session${n === 1 ? "" : "s"}`,
      emptyHistory: "No runs yet.",
      batchId: "Batch evaluation ID",
      selectRun: "Select a run to see its scores.",
      triageBtn: "Triage with Insights →",
    },
    insights: {
      newEyebrow: "New insights report",
      newTitle: "Triage agent sessions",
      intro:
        "Insights analyzes agent sessions to explain WHY the agent fails and WHAT users are trying to do — failure patterns with root causes and fixes, clustered user intents, and execution-behavior summaries. It reuses the batch-evaluation API (only one batch evaluation can be active per account).",
      pickAgent: "Agent",
      scope: "Sessions to analyze",
      scopes: { run: "From a past run", lookback: "Recent time window" },
      pickRun: "Run",
      noRuns: "No runs with recorded sessions for this agent — start one on the Runs page.",
      lookbackLabel: "Lookback hours",
      lookbackUnit: "hours of recent sessions",
      pickInsights: "Analyses to run",
      types: {
        "Builtin.Insight.FailureAnalysis": "Failure analysis",
        "Builtin.Insight.UserIntent": "User intent",
        "Builtin.Insight.ExecutionSummary": "Execution summary",
      },
      startBtn: "Run insights analysis",
      startedHint:
        "The service analyzes each session with LLMs, then clusters findings across sessions — typically a few minutes for a dozen sessions.",
      historyEyebrow: "History",
      historyTitle: "Past reports",
      emptyHistory: "No insight reports yet.",
      sourceRun: "run sessions",
      sourceLookback: "time window",
      status: {
        pending: "Pending",
        analyzing: "Analyzing",
        completed: "Completed",
        failed: "Failed",
      },
      reportEyebrow: "Report",
      resume: "Resume polling",
      failuresTitle: "Failure patterns (categories → subcategories → root causes)",
      noFailures: "No failure patterns detected in the analyzed sessions.",
      recommendation: "Suggested fix",
      sessionCount: (n) => `${n} session${n === 1 ? "" : "s"}`,
      toExperimentsHint:
        "Next: feed these findings into an optimization Experiment — Recommendations will generate an improved system prompt from the same traces, and an A/B test validates it.",
      intentsTitle: "User intents (most common asks)",
      executionTitle: "Execution patterns (how the agent solves problems)",
    },
    agentConfig: {
      eyebrow: "Configuration (read by experiments)",
      systemPrompt: "System prompt",
      toolDescriptions: "Tool descriptions",
      toolName: "Tool name",
      toolDesc: "Description",
      addTool: "+ Add tool",
      removeTool: "Remove",
      hint: "Recommendations and experiment bundles read from this config. The agent code must call BedrockAgentCoreContext.get_config_bundle() for bundles to take effect at runtime.",
      missing: "No config",
    },
    experiments: {
      title: "Optimization Experiments",
      eyebrow: "Optimize",
      empty: "No experiments yet — pick a deployed agent and start one.",
      createTitle: "New experiment",
      namePlaceholder: "e.g. Improve HR prompt",
      pickAgent: "Champion agent (deployed)",
      noConfigWarning: "This agent has no config — set its system prompt and tool descriptions on the Agents page first.",
      create: "Create experiment",
      open: "Open",
      stages: {
        recommend: "Recommend",
        bundles: "Bundles",
        abtest: "A/B test",
        monitor: "Monitor",
        promoted: "Promoted",
        canary: "Canary",
        canary_monitor: "Canary monitor",
        done: "Done",
      },
      resume: "Resume",
      resumeHint: "A job from a previous session is still in flight — resume polling it.",
      recommend: {
        title: "1 · AI recommendations",
        hintNeedsTraces: "Recommendations analyze the agent's recent CloudWatch traces — run an evaluation Run against this agent first.",
        spBtn: "Recommend system prompt",
        tdBtn: "Recommend tool descriptions",
        usedFallback: "The service returned no recommendation (thin traces) — showing the current value as fallback.",
        currentLabel: "Current",
        recommendedLabel: "Recommended",
        acceptBtn: "Accept & continue",
        editHint: "You can edit the accepted values before creating bundles.",
      },
      bundles: {
        title: "2 · Configuration bundles",
        controlLabel: "Control (current config)",
        treatmentLabel: "Treatment (accepted recommendation)",
        createBtn: "Create control + treatment bundles",
        hookNote: "Bundles only take effect if the agent code reads them via BedrockAgentCoreContext.get_config_bundle().",
      },
      abtest: {
        setupTitle: "3 · Gateway + config-bundle A/B (50/50)",
        setupBtn: "Create gateway + online eval + A/B test",
        trafficTitle: "Send traffic through the gateway",
        pickDataset: "Dataset",
        noDatasets: "No datasets — clone the gateway sample on the Datasets page.",
        sendBtn: "Send traffic",
        monitorTitle: "Monitor results",
        monitorBtn: "Monitor results",
        aggregationHint: "Aggregation takes ~10–15 minutes after the last session; polls every 30 s (25 min cap).",
        controlLabel: "C (control)",
        treatmentLabel: "T1 (treatment)",
        promoteTitle: "Promote",
        promoteBtn: "Promote treatment to control bundle",
        promoted: "Promoted",
      },
      canary: {
        title: "4 · Target-routing canary (optional)",
        skipBtn: "Finish without canary",
        pickChallenger: "Challenger agent (deployed)",
        noChallenger: "No other deployed agent — deploy the HR v2 sample (or your own) on the Agents page.",
        setupBtn: "Add challenger target + target A/B (90/10)",
        trafficTitle: "Send canary traffic",
        monitorTitle: "Monitor canary results",
        v1Label: "v1 (champion)",
        v2Label: "v2 (challenger)",
        weightsTitle: "Rollout weights",
        setWeight: (w) => `Shift to ${w}%`,
        currentWeight: (w) => `Challenger traffic: ${w}%`,
        rolloutHint: "Updates the live A/B test weights (full variant configs are resent).",
      },
      doneTitle: "Experiment complete",
      doneBody: "Tear down the gateway, A/B tests, bundles, and online evals when you're finished.",
      goCleanup: "Go to Cleanup →",
    },
    cleanup: {
      title: "Resource Cleanup",
      eyebrow: "Teardown",
      empty: "No experiments — nothing to clean up.",
      resources: "AWS resources",
      noResources: "No AWS resources recorded for this experiment.",
      teardownBtn: "Delete AWS resources",
      teardownDone: "Deleted",
      resultsDeleted: (n, total) => `${n} of ${total} resource categories deleted`,
      undeployHint: "Agents (runtimes + roles) are shared resources — undeploy them from the Agents page.",
      deleteRecordBtn: "Delete experiment record",
      cleanedAt: "Cleaned",
    },
  },
};

// ─── 中文 ────────────────────────────────────────────────────────────────────
export const zh: Messages = {
  landing: {
    eyebrow: "Amazon Bedrock AgentCore · 实验 4",
    heroLine1: "Agent 优化，",
    heroLine2: "端到端全流程。",
    intro:
      "AgentCore 优化之旅的交互式全仿真演练 — 部署一个 HR 助手，度量它的表现，让平台自动推荐改进，再通过 A/B 测试验证优化效果。无需 AWS 账号。",
    start: "开始旅程 →",
    simulationMode: "仿真模式",
    nineSteps: "10 个步骤",
    statAgent: "智能体",
    statAgentValue: "HR 助手",
    statEvaluators: "内置评估器",
    statEvaluatorsDelta: "+ 自定义 LLM 评委",
    statRouting: "A/B 路由模式",
    statRoutingHint: "配置包 · 目标路由",
    statRuntime: "真实运行时长",
    statRuntimeDelta: "→ 这里只需数秒",
    journeyEyebrow: "旅程",
    journeyTitle: "从基线到更优",
    journeySteps: [
      ["配置", "生成唯一运行后缀与运行时名称"],
      ["部署", "将 HR 助手发布到 AgentCore Runtime"],
      ["基线", "创建基线配置包，发送代表性流量，采集追踪数据"],
      ["评估", "为目标达成率、有用性、正确性打分"],
      ["触诊", "洞察解释会话为何失败、用户想要什么"],
      ["推荐", "自动改进系统提示词与工具描述"],
      ["配置包", "打包对照组与实验组两份配置"],
      ["配置包 A/B", "单运行时上按配置 50/50 分流验证"],
      ["金丝雀 A/B", "90/10 路由到 v2 运行时，见效再放量"],
      ["清理", "拆除本次旅程创建的所有资源"],
    ],
    hoodEyebrow: "幕后原理",
    hoodTitle: "每一步都是真实的 boto3",
    hoodBody:
      "每个仿真步骤都会展示它所对应的真实 AWS SDK 调用 — 因此本演练也是一份 API 参考。",
    footer:
      "AWS Bedrock AgentCore 实验 4 的仿真 · 所有标识符均为虚构 · 不会创建任何真实 AWS 资源。",
    openConsole: "打开 Live 控制台 →",
  },
  shell: {
    appTitle: "AgentCore 优化",
    acct: "账号",
    live: "live",
    simulation: "仿真",
    complete: (d, t) => `已完成 ${d}/${t}`,
    reset: "重置旅程",
    showCode: "▸ 显示代码",
    hideCode: "▾ 隐藏代码",
  },
  auth: {
    title: "AgentCore 优化控制台",
    passwordLabel: "访问密码",
    signIn: "登录",
    signingIn: "登录中…",
    wrongPassword: "密码错误。",
    unreachable: "无法连接后端 — 请重试。",
    hint: "此部署已启用密码保护。会话有效期 12 小时,保存在 HttpOnly cookie 中。",
  },
  banner: {
    warning: "⚡ Live 模式 — 创建真实 AWS 资源，会产生费用",
    account: "账号",
    goToCleanup: "→ 前往清理",
  },
  mode: { sim: "仿真", live: "⚡ Live AWS", groupLabel: "执行模式" },
  creds: {
    eyebrow: "Live 连接",
    title: "AWS 凭证",
    notConnected: "未连接",
    configure: "▸ 配置凭证",
    hide: "▾ 收起凭证选项",
    useRole: "使用 EC2 IAM 角色（默认 — 无需密钥）",
    useKeys: "提供访问密钥（仅本次会话）",
    accessKeyId: "Access key ID",
    secretAccessKey: "Secret access key",
    sessionToken: "Session token（可选）",
    region: "区域",
    regionOptional: "区域（可选）",
    test: "测试连接",
    testing: "测试中…",
    neverStored: "凭证仅用于本次会话，绝不会写入磁盘或浏览器本地存储。",
    cannotReach: "无法连接后端",
    identityFailed: "身份校验失败",
  },
  common: {
    running: "运行中…",
    retry: "↻ 重试",
    sending: "发送中…",
    sent: "已发送 ✓",
    created: "已创建 ✓",
    creating: "创建中…",
    generated: "已生成",
    analysing: "结果分析中…",
    pending: "待运行",
    sessions: (n, t) => `${n}/${t} 会话`,
  },
  stepLabel: (i) => `第 ${i} 步`,
  steps: {
    config: {
      title: "配置",
      shortTitle: "配置",
      lede: "每次运行都会生成唯一的随机后缀，避免重复旅程之间的资源冲突。运行时名称由它派生 — 一个用于 v1 智能体，另一个用于稍后部署的 v2 金丝雀版本。",
    },
    deploy: {
      title: "部署 HR 助手 v1",
      shortTitle: "部署 v1",
      lede: "部署脚本会将智能体代码构建为 ARM64 容器，创建 IAM 执行角色并上传到 S3，然后创建 AgentCore Runtime 并轮询直到状态变为 ACTIVE。真实环境需要 3–5 分钟；这里压缩为几秒。",
    },
    baseline: {
      title: "基线配置包与流量",
      shortTitle: "基线",
      lede: "配置包（Configuration Bundle）是智能体系统提示词与工具描述的版本化容器，在调用时读取 — 无需重新部署。我们先创建基线配置包，再发送 10 个代表性 HR 会话，其追踪数据将用于接下来的评估与推荐。",
    },
    eval: {
      title: "基线批量评估",
      shortTitle: "评估",
      lede: "批量评估会从 CloudWatch 中发现你刚发送的会话，用内置 LLM 评估器逐一评分并返回聚合分数。这些分数就是接下来 A/B 测试要挑战的基线。",
    },
    insights: {
      title: "失败洞察",
      shortTitle: "洞察",
      lede: "分数只告诉你智能体\"表现不佳\"——洞察告诉你\"为什么\"。同一个批量评估 API,传入 insights 而非 evaluators,即可对每个会话做触诊:失败模式(含根因与修复建议)、用户意图、执行行为。这些发现将喂给下一步的推荐。",
    },
    recommend: {
      title: "优化建议",
      shortTitle: "推荐",
      lede: "AgentCore 分析生产环境的追踪数据并提出配置改进：系统提示词推荐会重写提示词以提升目标指标；工具描述推荐会精炼每个工具的描述，让模型更准确地选择工具。",
    },
    bundles: {
      title: "配置包",
      shortTitle: "配置包",
      lede: "配置包是以运行时 ARN 为键、版本化且不可变的智能体配置容器。我们打包两份：对照组（原始配置）与实验组（你接受的推荐配置）。每次创建/更新都会产生一个可回读、可回滚的新版本。",
    },
    bundleAB: {
      title: "A/B 测试 — 配置包路由",
      shortTitle: "配置包 A/B",
      lede: "当变更是纯配置（不同的提示词或工具描述）时，两个变体运行在同一个运行时上。网关通过 W3C baggage 头为每个请求注入对应的配置包，会话内保持粘性。一个运行时、一个评估配置，即可分流流量。",
    },
    targetAB: {
      title: "A/B 测试 — 目标路由",
      shortTitle: "目标 A/B",
      lede: "当变更涉及代码（新工具、框架升级、不同实现）时，需要在两个独立的运行时之间路由。我们部署 v2（新增一个升级转接工具及内置的改进提示词），然后金丝雀发布：10% 流量到 v2，由独立评估配置打分，指标稳定后再逐步放量。",
    },
    cleanup: {
      title: "清理",
      shortTitle: "清理",
      lede: "拆除本次旅程创建的所有资源。每个类别独立删除，即使部分运行失败也能尽量清理。",
    },
  },
  stepInsights: {
    runEyebrow: "触诊",
    runTitle: "运行洞察分析",
    startBtn: "运行洞察分析",
    analyzed: "已分析",
    runHint: (sessions) =>
      `用 LLM 触诊 ${sessions} 个基线会话,再跨会话聚类出失败模式、用户意图与行为模式。`,
    typesEyebrow: "洞察类型",
    typesTitle: "三种分析",
    typeFailure: "失败类别 → 子类 → 根因,每条根因附修复建议。",
    typeIntent: "用户想完成什么,按频率聚类排序。",
    typeExecution: "智能体如何处理每个会话,结果如何。",
    exclusiveNote:
      "start_batch_evaluation 中 insights= 与 evaluators= 互斥 — 触诊与评分是两个独立作业,且每个账号同时只能有一个活跃的批量评估。",
    resultsEyebrow: "发现",
    resultsTitle: "触诊报告",
    failureBadge: (n) => `${n} 个会话存在失败`,
    failuresTitle: "失败模式(类别 → 子类 → 根因)",
    recommendation: "修复建议",
    sessionCount: (n) => `${n} 个会话`,
    intentsTitle: "用户意图(最常见的诉求)",
    executionTitle: "执行模式(智能体如何解决问题)",
    continueBtn: "继续,查看优化建议 →",
    bridgeNote:
      "这些根因正是下一步要修复的:推荐引擎读取同一批 trace,重写 system prompt 和工具描述来针对性解决。",
    emptyHint: "运行分析后,这里会显示基线会话的失败模式、用户意图与执行行为。",
  },
  step1: {
    identityEyebrow: "身份",
    identityTitle: "账号与区域",
    account: "AWS 账号",
    region: "区域",
    liveNote: "Live 账号 — 将创建真实 AWS 资源。",
    simNote: "虚构值 — 不会连接任何真实 AWS 账号。",
    runEyebrow: "运行配置",
    runTitle: "生成唯一后缀",
    generate: "生成配置",
    generated: "已生成 ✓",
    v1Name: "v1 运行时名称",
    v2Name: "v2 运行时名称",
  },
  step2: {
    deployEyebrow: "部署",
    deployTitle: "构建并启动运行时",
    deployBtn: "部署 HR 助手 v1",
    deployBtnLive: "部署 HR 助手 v1（真实）",
    deployed: "已部署",
    runtimeEyebrow: "运行时",
    runtimeTitle: "已创建的资源",
    arn: "智能体运行时 ARN",
    serviceName: "服务名称",
    region: "区域",
    logGroup: "CloudWatch 日志组",
    active: "运行时 ACTIVE",
    emptyHint: "运行部署后，这里会显示运行时 ARN、日志组和服务名称。",
  },
  step3: {
    bundleEyebrow: "步骤 3a",
    bundleTitle: "基线配置包",
    createBtn: "创建基线配置包",
    createBtnLive: "创建基线配置包（真实）",
    bundleId: "配置包 ID",
    version: "版本",
    bundleArn: "配置包 ARN",
    trafficEyebrow: "步骤 3b",
    trafficTitle: "发送基线流量",
    sendBtn: "发送 10 个会话",
    sendBtnLive: "发送 10 个会话（真实）",
    waitingIngest: (s) => `等待 CloudWatch 数据摄取… ${s} 秒`,
    ingested: "追踪已摄取",
    logEyebrow: "流量",
    logTitle: "会话日志",
    logEmpty:
      "暂无会话。先创建配置包，再发送流量，10 条代表性 HR 提示词会实时显示在这里。",
  },
  step4: {
    evalEyebrow: "评估",
    evalTitle: "运行批量评估",
    startBtn: "开始批量评估",
    startBtnLive: "开始批量评估（真实）",
    evaluated: "已评估",
    runHint: (n) =>
      `发现会话后，用选中的 ${n} 个评估器逐一评分，再按评估器聚合平均分。`,
    pickerEyebrow: "评估器",
    pickerTitle: "选择评估器",
    pickerSelected: (n) => `已选 ${n} 个`,
    pickerHint:
      "默认三件套始终运行。AgentCore 提供 13 个内置评估器，覆盖会话、轨迹和工具调用三个级别 — 可任选加入基线。",
    default: "默认",
    customTag: "自定义 · LLM 评委",
    showCustomCode: "查看自定义评估器代码",
    hideCustomCode: "收起自定义评估器代码",
    scoresEyebrow: "基线",
    scoresTitle: "评估器分数",
    baselineCaptured: "基线已记录",
    emptyHint: "运行评估后，这里会显示所选评估器在基线会话上的分数。",
    levels: { SESSION: "会话级", TRACE: "轨迹级", TOOL_CALL: "工具调用级" },
  },
  step5: {
    spEyebrow: "步骤 6a",
    spTitle: "系统提示词推荐",
    spBtn: "生成系统提示词推荐",
    spBtnLive: "生成系统提示词推荐（真实）",
    tdEyebrow: "步骤 6b",
    tdTitle: "工具描述推荐",
    tdBtn: "生成工具描述推荐",
    tdBtnLive: "生成工具描述推荐（真实）",
    currentPrompt: "当前系统提示词",
    recommendedPrompt: "推荐系统提示词",
    before: "修改前",
    after: "修改后",
    acceptTitle: "接受这些推荐？",
    acceptBody: "它们将被打包为实验组配置包，在接下来的步骤中与原始配置进行 A/B 测试。",
    acceptBtn: "接受推荐",
    accepted: "已接受 ✓",
  },
  step6: {
    controlEyebrow: "对照组 (C)",
    controlTitle: "原始配置",
    createControl: "创建对照组配置包",
    treatmentEyebrow: "实验组 (T1)",
    treatmentTitle: "推荐配置",
    createTreatment: "创建实验组配置包",
    bundleId: "配置包 ID",
    version: "版本",
    compareEyebrow: "读取与比较",
    compareTitle: "对照组 vs 实验组 — 版本差异",
    keysChanged: (n) => `${n} 个键有变更`,
    compareBtn: "比较版本",
    toolsChanged: (n) => `${n} 个有变更`,
    continueBtn: "继续 A/B 测试 →",
    continued: "已继续 ✓",
  },
  step7: {
    setupEyebrow: "步骤 8a–d",
    setupTitle: "搭建网关与 A/B 测试",
    setupBtn: "创建网关 + A/B 测试",
    setupBtnLive: "创建网关 + A/B 测试（真实）",
    setupDone: "A/B 测试运行中",
    trafficEyebrow: "步骤 8e",
    trafficTitle: "发送网关流量",
    sendBtn: "发送 20 个网关会话",
    sendBtnLive: "发送 20 个网关会话（真实）",
    stickyHint:
      "每个会话按会话 ID 被分配到 C 或 T1，并以对应的配置包路由。同一会话内分配保持粘性。",
    resultsEyebrow: "步骤 8f",
    resultsTitle: "A/B 测试结果",
    monitorBtn: "监控结果",
    monitorBtnLive: "监控结果（真实）",
    resultsReady: "结果就绪",
    analysed: "已分析",
    controlLabel: "C · 原始提示词",
    treatmentLabel: "T1 · 推荐提示词",
    promoteEyebrow: "步骤 8g",
    promoteWinTitle: "提升胜出配置",
    promoteTitle: "提升决策",
    t1Wins: "T1 胜出",
    noImprovement: "无改进",
    mixed: "互有胜负",
    promoteBody: "提升操作会把对照组配置包更新为推荐配置 — 并通过以下字段记录版本谱系：",
    promoteBtn: "提升胜出者",
    promoteAnywayBtn: "仍然提升 T1",
    promoted: "已提升 ✓",
    prevVersion: "原对照组版本",
    newVersion: "新对照组版本",
  },
  step8: {
    comparisonEyebrow: "如何选择",
    comparisonTitle: "配置包路由 vs 目标路由",
    configBundleCol: "配置包路由",
    targetBasedCol: "目标路由",
    routingRows: [
      {
        dimension: "变更内容",
        configBundle: "系统提示词或配置（无代码变更）",
        targetBased: "智能体代码、工具或模型",
      },
      {
        dimension: "部署",
        configBundle: "无需重新部署",
        targetBased: "需要部署新的运行时",
      },
      {
        dimension: "所需运行时",
        configBundle: "一个共享运行时",
        targetBased: "两个独立运行时",
      },
      {
        dimension: "所需评估配置",
        configBundle: "一个共享在线评估配置",
        targetBased: "每个变体一个（不同日志组）",
      },
      {
        dimension: "适用场景",
        configBundle: "提示词优化、配置调优",
        targetBased: "代码上线、版本升级",
      },
      {
        dimension: "风险",
        configBundle: "极低 — 通过配置包即时回滚",
        targetBased: "较高 — 二元切换",
      },
    ],
    deployEyebrow: "步骤 9a",
    deployTitle: "部署 HR 助手 v2",
    deployBtn: "部署 v2（新工具 + 提示词）",
    deployBtnLive: "部署 v2（真实 — 新工具 + 提示词）",
    deployed: "v2 已部署",
    v2Arn: "v2 运行时 ARN",
    v2ToolNote: (tool) => `+ ${tool} — 新工具（共 6 个）。改进的系统提示词已内置到代码中。`,
    canaryEyebrow: "步骤 9b–d",
    canaryTitle: "金丝雀 A/B 测试",
    setupBtn: "创建 90/10 目标 A/B 测试",
    setupBtnLive: "创建 90/10 目标 A/B 测试（真实）",
    canaryLive: "金丝雀运行中",
    sendBtn: (n) => `发送 ${n} 个目标会话`,
    sendBtnLive: (n) => `发送 ${n} 个目标会话（真实）`,
    resultsEyebrow: "步骤 9e",
    resultsTitle: "金丝雀结果 — v1 vs v2",
    monitorBtn: "监控金丝雀结果",
    monitorBtnLive: "监控金丝雀结果（真实）",
    resultsReady: "结果就绪",
    v1Label: "v1（对照 · 90%）",
    v2Label: "v2（实验 · 10%）",
    rolloutEyebrow: "步骤 9f",
    rolloutTitle: "分阶段放量",
    rollout: { canary: "金丝雀", ramp: "放量", full: "全量" },
    rolloutNotes: {
      canary: "10% 流量到 v2 — 观察指标",
      ramp: "50/50 — 建立信心",
      full: "100% 到 v2 — 下线 v1",
    },
    rampBtn: (w) => `放量至 ${w}% →`,
    fullyRolledOut: "已全量上线",
  },
  step9: {
    teardownEyebrow: "拆除",
    teardownTitle: "删除所有资源",
    categories: (n) => `${n} 个类别`,
    allDeleted: "全部已删除",
    runBtn: "执行清理",
    done: "清理完成 ✓",
    cleanupItems: {
      abtests: { label: "A/B 测试", detail: "配置包 + 目标路由测试" },
      onlineeval: { label: "在线评估配置", detail: "v1 + v2 自动评分" },
      bundles: { label: "配置包", detail: "基线、对照组、实验组" },
      tracing: { label: "网关追踪", detail: "X-Ray 投递 + 数据源" },
      targets: { label: "网关目标", detail: "HRAgentV1、HRAgentV2" },
      gateway: { label: "网关", detail: "HTTP 网关 + IAM 授权器" },
      runtimes: { label: "智能体运行时", detail: "v1 + v2 AgentCore 运行时" },
      iam: { label: "IAM 执行角色", detail: "权限 + 信任策略" },
      s3: { label: "S3 构件", detail: "部署桶中的对象" },
    },
    recapEyebrow: "回顾",
    recapTitle: "旅程完成",
    colStep: "步骤",
    colAction: "操作",
    colApi: "关键 API",
    summaryActions: {
      "2": "将 HR 助手部署到 AgentCore Runtime",
      "3": "创建基线配置包并发送流量",
      "4": "度量基线性能",
      "5a": "基于追踪生成改进的系统提示词",
      "5b": "生成改进的工具描述",
      "6": "打包对照组与实验组配置",
      "7": "通过配置包路由 A/B 测试配置变更",
      "8": "通过目标路由金丝雀发布 v2",
    },
    recapEmpty: "完成清理后，这里会显示完整的旅程回顾与关键收获。",
    takeawaysEyebrow: "关键收获",
    takeawaysTitle: "AgentCore 如何优化已部署的智能体",
    takeaways: [
      {
        title: "可观测性",
        body: "采集详细的追踪与指标，深入了解每次响应背后的推理与工具调用。",
      },
      {
        title: "评估",
        body: "自动为追踪打分 — 从目标达成到有用性与正确性。",
      },
      {
        title: "推荐",
        body: "让平台基于观测到的表现，提出更优的系统提示词与工具描述。",
      },
      {
        title: "A/B 测试",
        body: "在全量上线前，用数据确认每次新部署都能稳定提升效果。",
      },
    ],
  },
  evaluators: {
    labels: {
      "Builtin.GoalSuccessRate": "目标达成率",
      "Builtin.Helpfulness": "有用性",
      "Builtin.Correctness": "正确性",
      "Builtin.Faithfulness": "忠实度",
      "Builtin.ResponseRelevance": "回答相关性",
      "Builtin.Conciseness": "简洁性",
      "Builtin.Coherence": "连贯性",
      "Builtin.InstructionFollowing": "指令遵循",
      "Builtin.Refusal": "拒答检测",
      "Builtin.Harmfulness": "有害性",
      "Builtin.Stereotyping": "刻板印象",
      "Builtin.ToolSelectionAccuracy": "工具选择准确率",
      "Builtin.ToolParameterAccuracy": "工具参数准确率",
    },
    descriptions: {
      "Builtin.GoalSuccessRate": "对话是否达成了用户的目标？",
      "Builtin.Helpfulness": "回答是否有用、可执行？",
      "Builtin.Correctness": "智能体给出的信息是否准确？",
      "Builtin.Faithfulness": "回答是否有所给上下文支撑？",
      "Builtin.ResponseRelevance": "回答是否切合用户的问题？",
      "Builtin.Conciseness": "是否简明扼要且不遗漏关键信息？",
      "Builtin.Coherence": "回答是否逻辑连贯、结构清晰？",
      "Builtin.InstructionFollowing": "是否遵循系统指令？",
      "Builtin.Refusal": "是否回避或拒绝了本可回答的问题？",
      "Builtin.Harmfulness": "回答是否包含有害内容？",
      "Builtin.Stereotyping": "是否存在对个人或群体的刻板概括？",
      "Builtin.ToolSelectionAccuracy": "是否为任务选择了正确的工具？",
      "Builtin.ToolParameterAccuracy": "工具参数提取是否准确？",
    },
    customDescription: "惩罚泄露其他员工数据或杜撰 HR 政策的回答。",
  },
  verdict: {
    win: (scope, summary) => `T1 在${scope}上均有提升（${summary}）。`,
    loss: (scope, summary) =>
      `T1 在${scope}上都没有胜过对照组（${summary}）。建议积累更多会话后再决定是否提升。`,
    mixed: (improved, total, summary) =>
      `结果互有胜负 — T1 在 ${total} 个指标中的 ${improved} 个上有提升（${summary}）。是否提升需要权衡判断。`,
    bothMetrics: "两个指标",
    allMetrics: (n) => `全部 ${n} 个指标`,
    eitherMetric: "任一指标",
    anyMetric: "任何指标",
    significant: "该提升具有统计显著性。",
    notSignificant: "差异不具有统计显著性。",
  },
  console: {
    title: "Agent 评估控制台",
    subtitle: "部署任意 Agent，用你的数据集发起评估，由 AgentCore 评估器打分。",
    nav: {
      agents: "Agents",
      datasets: "数据集",
      evaluators: "评估器",
      runs: "评估运行",
      insights: "洞察",
      experiments: "优化实验",
      cleanup: "资源清理",
    },
    common: {
      name: "名称",
      description: "描述",
      save: "保存",
      cancel: "取消",
      delete: "删除",
      confirmDelete: "确认删除",
      edit: "编辑",
      back: "← 返回",
      refresh: "刷新",
      loading: "加载中…",
      uploadFile: "上传文件",
      updated: "更新于",
      error: "错误",
    },
    agents: {
      title: "Agents",
      eyebrow: "Agent 代码",
      newBlank: "新建空白 Agent",
      newFromSample: "从 HR 样例新建",
      newFromSampleV2: "从 HR v2 样例新建",
      newFromSampleZh: "从 HR 中文样例新建",
      uploadPy: "上传 .py",
      code: "Agent 代码（部署为 main.py）",
      requirements: "额外 pip 依赖",
      requirementsHint: "每行一个依赖，例如 requests>=2。需提供 aarch64 wheel。",
      baseDeps: "基础依赖（始终安装）",
      deploy: "部署",
      deploying: "部署中…",
      deployed: "已部署",
      notDeployed: "未部署",
      deployFailed: "部署失败",
      undeploy: "下线",
      runtimeArn: "Runtime ARN",
      logGroup: "日志组",
      serviceName: "服务名",
      region: "区域",
      empty: "还没有 Agent — 可从 HR 样例克隆、新建空白模板，或上传 .py 文件。",
      runWithAgent: "运行评估",
      deployHint: "部署将构建代码包（ARM64 pip 安装）、上传到 S3、创建 Runtime 并轮询至 ACTIVE — 通常需要 5–15 分钟。",
      editorLoading: "编辑器加载中…",
      nameRequired: "名称不能为空",
      codeRequired: "Agent 代码不能为空",
    },
    datasets: {
      title: "数据集",
      eyebrow: "评估数据",
      newBlank: "新建空白数据集",
      newFromSample: "从 HR 样例新建",
      fromSample: (name) => `+ ${name.replace(" (sample)", "").replace("(中文样例)", " · 中文")}`,
      upload: "上传 JSON / JSONL",
      itemCount: (n) => `${n} 条`,
      prompt: "Prompt",
      context: "Context（可选前缀）",
      contextHint: "发送时拼接在 prompt 前，例如 \"Employee ID: EMP-001.\"",
      addRow: "+ 添加行",
      removeRow: "删除",
      formatHint: "支持格式：{prompt, context?} 的 JSON 数组，或 JSONL（每行一个对象）。",
      invalidFile: (err) => `文件解析失败：${err}`,
      empty: "还没有数据集 — 可从 HR 样例克隆、新建空白表格，或上传文件。",
      itemsRequired: "至少需要一条包含 prompt 的数据",
      download: "下载 JSON",
    },
    evaluators: {
      title: "评估器",
      builtinEyebrow: "内置评估器",
      customEyebrow: "自定义 LLM-judge 评估器",
      createTitle: "创建自定义评估器",
      instructions: "评审指令",
      modelId: "评审模型 ID",
      level: "级别",
      ratingScale: "评分刻度",
      scaleValue: "分值",
      scaleLabel: "标签",
      scaleDefinition: "定义",
      addPoint: "+ 添加刻度",
      prefillSample: "填入 HR 样例",
      createBtn: "创建评估器",
      noCustom: "还没有自定义评估器。",
      loadFailed: "无法加载自定义评估器（需要 AWS 凭证）。",
      levelOf: (level) => `级别：${level}`,
    },
    runs: {
      title: "评估运行",
      newRunEyebrow: "新建评估运行",
      newRunTitle: "发送流量 + 批量评估",
      historyEyebrow: "历史记录",
      historyTitle: "历史运行",
      pickAgent: "Agent",
      pickDataset: "数据集",
      pickEvaluators: "评估器",
      onlyDeployedHint: "只有已部署的 Agent 才能参与评估。",
      noDeployedAgents: "没有已部署的 Agent — 请先在 Agents 页部署。",
      noDatasets: "没有数据集 — 请先在数据集页创建。",
      startBtn: "开始运行",
      startedHint: "每条数据发起一个会话，等待 trace 落入 CloudWatch 后执行批量评估 — 全程需数分钟。",
      status: {
        pending: "等待中",
        invoking: "发送流量",
        waiting: "等待 trace",
        evaluating: "评估中",
        completed: "已完成",
        failed: "失败",
      },
      scoresEyebrow: "评分",
      sessions: (n) => `${n} 个会话`,
      emptyHistory: "还没有运行记录。",
      batchId: "批量评估 ID",
      selectRun: "选择一条运行记录查看评分。",
      triageBtn: "用洞察触诊 →",
    },
    insights: {
      newEyebrow: "新建洞察报告",
      newTitle: "触诊 Agent 会话",
      intro:
        "洞察(Insights)分析 Agent 会话,回答\"为什么失败\"和\"用户想做什么\"——失败模式(含根因与修复建议)、用户意图聚类、执行行为摘要。复用批量评估 API(每个账号同时只能有一个活跃的批量评估)。",
      pickAgent: "Agent",
      scope: "分析哪些会话",
      scopes: { run: "来自历史运行", lookback: "最近时间窗口" },
      pickRun: "运行记录",
      noRuns: "该 Agent 没有带会话记录的运行 — 请先在评估运行页跑一次。",
      lookbackLabel: "回看小时数",
      lookbackUnit: "小时内的会话",
      pickInsights: "分析类型",
      types: {
        "Builtin.Insight.FailureAnalysis": "失败分析",
        "Builtin.Insight.UserIntent": "用户意图",
        "Builtin.Insight.ExecutionSummary": "执行摘要",
      },
      startBtn: "运行洞察分析",
      startedHint:
        "服务用 LLM 逐会话分析,再跨会话聚类 — 十余个会话通常需要几分钟。",
      historyEyebrow: "历史记录",
      historyTitle: "历史报告",
      emptyHistory: "还没有洞察报告。",
      sourceRun: "运行会话",
      sourceLookback: "时间窗口",
      status: {
        pending: "等待中",
        analyzing: "分析中",
        completed: "已完成",
        failed: "失败",
      },
      reportEyebrow: "报告",
      resume: "恢复轮询",
      failuresTitle: "失败模式(类别 → 子类 → 根因)",
      noFailures: "所分析的会话中未发现失败模式。",
      recommendation: "修复建议",
      sessionCount: (n) => `${n} 个会话`,
      toExperimentsHint:
        "下一步:把这些发现带进优化实验 — 推荐(Recommendations)会基于同一批 trace 生成改进的 system prompt,再用 A/B 测试验证。",
      intentsTitle: "用户意图(最常见的诉求)",
      executionTitle: "执行模式(Agent 如何解决问题)",
    },
    agentConfig: {
      eyebrow: "配置(实验读取)",
      systemPrompt: "System Prompt",
      toolDescriptions: "工具描述",
      toolName: "工具名",
      toolDesc: "描述",
      addTool: "+ 添加工具",
      removeTool: "删除",
      hint: "推荐与实验 bundle 从此配置读取。Agent 代码必须调用 BedrockAgentCoreContext.get_config_bundle(),bundle 才会在运行时生效。",
      missing: "无配置",
    },
    experiments: {
      title: "优化实验",
      eyebrow: "优化",
      empty: "还没有实验 — 选一个已部署的 Agent 开始。",
      createTitle: "新建实验",
      namePlaceholder: "例如:优化 HR prompt",
      pickAgent: "冠军 Agent(已部署)",
      noConfigWarning: "该 Agent 没有配置 — 请先在 Agents 页设置 system prompt 和工具描述。",
      create: "创建实验",
      open: "打开",
      stages: {
        recommend: "推荐",
        bundles: "Bundles",
        abtest: "A/B 测试",
        monitor: "监控",
        promoted: "已提升",
        canary: "金丝雀",
        canary_monitor: "金丝雀监控",
        done: "完成",
      },
      resume: "恢复",
      resumeHint: "上次会话有任务仍在进行 — 点击恢复继续轮询。",
      recommend: {
        title: "1 · AI 推荐",
        hintNeedsTraces: "推荐基于该 Agent 近期的 CloudWatch trace — 请先在评估运行页对它跑一次评估。",
        spBtn: "推荐 System Prompt",
        tdBtn: "推荐工具描述",
        usedFallback: "服务未返回推荐(trace 不足)— 已回退为当前值。",
        currentLabel: "当前",
        recommendedLabel: "推荐",
        acceptBtn: "接受并继续",
        editHint: "创建 bundle 前可以编辑接受的值。",
      },
      bundles: {
        title: "2 · 配置 Bundle",
        controlLabel: "Control(当前配置)",
        treatmentLabel: "Treatment(接受的推荐)",
        createBtn: "创建 Control + Treatment Bundle",
        hookNote: "Agent 代码需通过 BedrockAgentCoreContext.get_config_bundle() 读取,bundle 才会生效。",
      },
      abtest: {
        setupTitle: "3 · 网关 + 配置 Bundle A/B(50/50)",
        setupBtn: "创建网关 + 在线评估 + A/B 测试",
        trafficTitle: "通过网关发送流量",
        pickDataset: "数据集",
        noDatasets: "没有数据集 — 请先在数据集页克隆网关样例。",
        sendBtn: "发送流量",
        monitorTitle: "监控结果",
        monitorBtn: "监控结果",
        aggregationHint: "最后一个会话后聚合约需 10–15 分钟;每 30 秒轮询(上限 25 分钟)。",
        controlLabel: "C(对照)",
        treatmentLabel: "T1(实验)",
        promoteTitle: "提升",
        promoteBtn: "将 Treatment 提升为 Control Bundle",
        promoted: "已提升",
      },
      canary: {
        title: "4 · 目标路由金丝雀(可选)",
        skipBtn: "跳过金丝雀,直接完成",
        pickChallenger: "挑战者 Agent(已部署)",
        noChallenger: "没有其他已部署 Agent — 请先在 Agents 页部署 HR v2 样例(或你自己的)。",
        setupBtn: "添加挑战者 Target + 目标 A/B(90/10)",
        trafficTitle: "发送金丝雀流量",
        monitorTitle: "监控金丝雀结果",
        v1Label: "v1(冠军)",
        v2Label: "v2(挑战者)",
        weightsTitle: "灰度权重",
        setWeight: (w) => `切到 ${w}%`,
        currentWeight: (w) => `挑战者流量:${w}%`,
        rolloutHint: "实时更新 A/B 测试权重(重发完整 variant 配置)。",
      },
      doneTitle: "实验完成",
      doneBody: "结束后请清理网关、A/B 测试、Bundle 和在线评估资源。",
      goCleanup: "前往资源清理 →",
    },
    cleanup: {
      title: "资源清理",
      eyebrow: "清理",
      empty: "没有实验 — 无需清理。",
      resources: "AWS 资源",
      noResources: "该实验没有记录任何 AWS 资源。",
      teardownBtn: "删除 AWS 资源",
      teardownDone: "已删除",
      resultsDeleted: (n, total) => `${total} 类资源中已删除 ${n} 类`,
      undeployHint: "Agent(runtime + 角色)是共享资源 — 请到 Agents 页下线。",
      deleteRecordBtn: "删除实验记录",
      cleanedAt: "清理于",
    },
  },
};

export const MESSAGES: Record<Lang, Messages> = { en, zh };
