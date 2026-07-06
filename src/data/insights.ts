/**
 * Simulated AgentCore Insights results (Step 5). In the real service these
 * come from `start_batch_evaluation` with `insights=[...]` analysing session
 * traces; here they are authored to be believable AND to motivate the exact
 * recommendations Step 6 shows: the root causes below are precisely what the
 * recommended system prompt (employee-ID protocol, tool-choice table, no
 * invented policy text) and richer tool descriptions fix.
 *
 * Shapes mirror GetBatchEvaluation's failureAnalysisResult / userIntentResult /
 * executionSummaryResult (same fields the Live console renders).
 */

export interface SimFailureRootCause {
  name: string;
  recommendation: string;
  affectedSessionCount: number;
}

export interface SimFailureSubCategory {
  name: string;
  affectedSessionCount: number;
  rootCauses: SimFailureRootCause[];
}

export interface SimFailureCategory {
  name: string;
  description: string;
  affectedSessionCount: number;
  subCategories: SimFailureSubCategory[];
}

export interface SimCluster {
  name: string;
  description: string;
  affectedSessionCount: number;
}

/** Failure taxonomy tree — categories → subcategories → root-cause clusters. */
export const SIM_FAILURES: SimFailureCategory[] = [
  {
    name: "Incorrect actions",
    description: "The agent picked the wrong tool or retrieved the wrong data.",
    affectedSessionCount: 3,
    subCategories: [
      {
        name: "Poor information retrieval",
        affectedSessionCount: 2,
        rootCauses: [
          {
            name: "Employee ID not extracted from the prompt prefix",
            recommendation:
              "Add an explicit instruction to extract the employee identifier " +
              'from the "Employee ID:" prefix and pass it to every tool call ' +
              "that needs it.",
            affectedSessionCount: 2,
          },
        ],
      },
      {
        name: "Wrong tool selection",
        affectedSessionCount: 1,
        rootCauses: [
          {
            name: "lookup_hr_policy called for a benefits question",
            recommendation:
              "Sharpen tool descriptions to state valid topics/benefits per " +
              "tool so the model can discriminate between policy and benefits " +
              "questions.",
            affectedSessionCount: 1,
          },
        ],
      },
    ],
  },
  {
    name: "Hallucinations",
    description: "The agent answered from memory instead of tool data.",
    affectedSessionCount: 2,
    subCategories: [
      {
        name: "Fabricated policy details",
        affectedSessionCount: 2,
        rootCauses: [
          {
            name: "PTO rollover rules invented instead of calling lookup_hr_policy",
            recommendation:
              "Add a hard rule: never invent or estimate policy text, benefit " +
              "amounts, dates, or pay figures — always look them up; say so " +
              "plainly when a tool returns nothing.",
            affectedSessionCount: 2,
          },
        ],
      },
    ],
  },
  {
    name: "Task instruction issues",
    description: "The agent skipped confirmations required by the task.",
    affectedSessionCount: 1,
    subCategories: [
      {
        name: "Non-compliance with instructions",
        affectedSessionCount: 1,
        rootCauses: [
          {
            name: "PTO request submitted without confirming the exact dates",
            recommendation:
              "Require the agent to confirm start/end dates back to the " +
              "employee before calling submit_pto_request.",
            affectedSessionCount: 1,
          },
        ],
      },
    ],
  },
];

/** User-intent clusters, ranked by frequency (10 baseline sessions). */
export const SIM_USER_INTENTS: SimCluster[] = [
  {
    name: "Check or use PTO",
    description:
      "Balance checks and time-off requests — the dominant use case, and " +
      "where retrieval failures hurt most.",
    affectedSessionCount: 4,
  },
  {
    name: "Understand benefits",
    description: "Health insurance options, employer 401k match, coverage levels.",
    affectedSessionCount: 3,
  },
  {
    name: "Look up HR policy",
    description: "Remote work and parental leave policy questions.",
    affectedSessionCount: 2,
  },
  {
    name: "Retrieve pay information",
    description: "Pay stub retrieval with deduction explanations.",
    affectedSessionCount: 1,
  },
];

/** Execution-pattern clusters — how the agent approached the sessions. */
export const SIM_EXECUTION_SUMMARIES: SimCluster[] = [
  {
    name: "Single tool call, direct answer",
    description:
      "Extracted the employee ID, called the right tool once, summarized the " +
      "result. The happy path.",
    affectedSessionCount: 6,
  },
  {
    name: "Answered without consulting tools",
    description:
      "Responded from the model's general knowledge without calling any tool — " +
      "the source of the fabricated policy details.",
    affectedSessionCount: 2,
  },
  {
    name: "Multiple retries after a failed lookup",
    description:
      "Repeated the same tool call with the same missing employee ID instead " +
      "of asking the user for it.",
    affectedSessionCount: 2,
  },
];

/** Totals used by the step badges. */
export const SIM_INSIGHTS_TOTALS = {
  sessions: 10,
  failureSessions: SIM_FAILURES.reduce((n, c) => n + c.affectedSessionCount, 0),
};
