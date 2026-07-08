/**
 * Authored Sim content for the Dataset Evaluation & User Simulation step.
 * Mirrors the backend samples (samples.py) so Sim and Live tell one story:
 * the same HR agent, the same scenario shapes, deterministic results.
 *
 * The partial failure is deliberate: scenario "benefits-then-paystub" misses
 * its expected trajectory (agent answered from memory instead of calling
 * get_benefits_summary), which motivates the Insights triage next step.
 */

export interface SimScenarioTurn {
  input: string;
  expected_response?: string;
}

export interface SimPredefinedScenario {
  scenario_id: string;
  turns: SimScenarioTurn[];
  expected_trajectory?: string[];
  assertions?: string[];
}

export interface SimSimulatedScenario {
  scenario_id: string;
  scenario_description: string;
  actor_profile: { context: string; goal: string; traits: Record<string, string> };
  input: string;
  max_turns: number;
  assertions: string[];
}

/** 3 predefined multi-turn HR scenarios with ground truth. */
export const SIM_PREDEFINED_SCENARIOS: SimPredefinedScenario[] = [
  {
    scenario_id: "pto-balance-then-request",
    turns: [
      {
        input: "Employee ID: EMP-001. What is my current PTO balance?",
        expected_response: "You have 15 days of PTO remaining.",
      },
      { input: "Great — please request leave from 2026-08-04 to 2026-08-08 for a family vacation." },
    ],
    expected_trajectory: ["get_pto_balance", "submit_pto_request"],
    assertions: [
      "Agent reports the employee's PTO balance before submitting the request",
      "Agent confirms the PTO request dates back to the employee",
    ],
  },
  {
    scenario_id: "policy-question",
    turns: [
      {
        input: "What exactly is the PTO rollover policy?",
        expected_response:
          "Employees may roll over up to 5 unused PTO days into the next calendar year.",
      },
    ],
    expected_trajectory: ["lookup_hr_policy"],
    assertions: ["Agent cites the rollover limit from the HR policy"],
  },
  {
    scenario_id: "benefits-then-paystub",
    turns: [
      { input: "Employee ID: EMP-042. What are my health insurance options?" },
      {
        input: "Also show me my January 2026 pay stub.",
        expected_response:
          "Here is your January 2026 pay stub with gross pay, deductions, and net pay.",
      },
    ],
    expected_trajectory: ["get_benefits_summary", "get_pay_stub"],
    assertions: [
      "Agent summarizes at least two health insurance plan options",
      "Agent presents the pay stub for the requested period",
    ],
  },
];

/** Per-scenario, per-evaluator authored results for the dataset evaluation.
 * benefits-then-paystub fails its trajectory (skipped get_benefits_summary)
 * and scores low on Correctness — the seed for the Insights step's story. */
export const SIM_DATASET_EVAL_RESULTS: {
  scenario_id: string;
  scores: { evaluatorId: string; score: number; pass: boolean }[];
}[] = [
  {
    scenario_id: "pto-balance-then-request",
    scores: [
      { evaluatorId: "Builtin.GoalSuccessRate", score: 1.0, pass: true },
      { evaluatorId: "Builtin.Correctness", score: 0.93, pass: true },
      { evaluatorId: "Builtin.TrajectoryExactOrderMatch", score: 1.0, pass: true },
    ],
  },
  {
    scenario_id: "policy-question",
    scores: [
      { evaluatorId: "Builtin.GoalSuccessRate", score: 1.0, pass: true },
      { evaluatorId: "Builtin.Correctness", score: 0.88, pass: true },
      { evaluatorId: "Builtin.TrajectoryExactOrderMatch", score: 1.0, pass: true },
    ],
  },
  {
    scenario_id: "benefits-then-paystub",
    scores: [
      { evaluatorId: "Builtin.GoalSuccessRate", score: 0.5, pass: false },
      { evaluatorId: "Builtin.Correctness", score: 0.41, pass: false },
      { evaluatorId: "Builtin.TrajectoryExactOrderMatch", score: 0.0, pass: false },
    ],
  },
];

/** Aggregates shown in the results header. */
export const SIM_DATASET_EVAL_TOTALS = {
  scenarios: 3,
  turns: 5,
  averages: [
    { evaluatorId: "Builtin.GoalSuccessRate", score: 0.83 },
    { evaluatorId: "Builtin.Correctness", score: 0.74 },
    { evaluatorId: "Builtin.TrajectoryExactOrderMatch", score: 0.67 },
  ],
};

/** 2 personas for the user-simulation demo. */
export const SIM_SIMULATED_SCENARIOS: SimSimulatedScenario[] = [
  {
    scenario_id: "frustrated-employee-leave",
    scenario_description: "A frustrated employee needs leave booked quickly",
    actor_profile: {
      traits: { expertise: "non-technical", tone: "frustrated but polite", patience: "low" },
      context: "An employee (ID EMP-001) whose childcare fell through and who must take next Monday through Wednesday off",
      goal: "Get a PTO request submitted for the three days and receive a confirmation",
    },
    input: "I really need time off next week and the portal keeps erroring. Can you help?",
    max_turns: 8,
    assertions: [
      "Agent submits a PTO request covering the three requested days",
      "Agent confirms the submission back to the employee",
    ],
  },
  {
    scenario_id: "curious-new-hire-benefits",
    scenario_description: "A curious new hire explores benefits",
    actor_profile: {
      traits: { expertise: "novice", tone: "curious" },
      context: "A new hire in their first week who has not enrolled in any benefits yet",
      goal: "Understand the 401k match and at least one health insurance option",
    },
    input: "Hi! I just joined — can you walk me through the benefits?",
    max_turns: 6,
    assertions: [
      "Agent explains the 401k matching policy",
      "Agent describes at least one health insurance plan",
    ],
  },
];

export interface SimTranscriptEntry {
  turn: number;
  role: "user" | "agent" | "actor_reasoning";
  text: string;
}

export interface SimTranscript {
  scenario_id: string;
  stopped_by: "goal" | "max_turns";
  turns: number;
  transcript: SimTranscriptEntry[];
  scores: { evaluatorId: string; score: number; pass: boolean }[];
}

/** Deterministic actor conversations: one goal-stop, one max_turns-stop. */
export const SIM_SIMULATION_TRANSCRIPTS: SimTranscript[] = [
  {
    scenario_id: "frustrated-employee-leave",
    stopped_by: "goal",
    turns: 3,
    transcript: [
      { turn: 1, role: "user", text: "I really need time off next week and the portal keeps erroring. Can you help?" },
      { turn: 1, role: "agent", text: "I'm sorry about the portal trouble — I can submit that for you directly. Which days do you need, and what's your employee ID?" },
      { turn: 1, role: "actor_reasoning", text: "The agent asked for specifics. I'm in a hurry, so I'll give the ID and the exact days at once." },
      { turn: 2, role: "user", text: "EMP-001. Monday July 13 through Wednesday July 15. Please just book it." },
      { turn: 2, role: "agent", text: "Done — I've submitted a PTO request for EMP-001 covering 2026-07-13 to 2026-07-15 (3 days). Your remaining balance after approval will be 12 days. Confirmation #PTO-88412." },
      { turn: 2, role: "actor_reasoning", text: "Request submitted AND confirmed with a reference number. That's exactly my goal — I can stop here." },
      { turn: 3, role: "user", text: "Thank you, that's all I needed." },
      { turn: 3, role: "agent", text: "You're welcome! The request is pending your manager's approval — you'll get a notification once it's confirmed." },
    ],
    scores: [
      { evaluatorId: "Builtin.GoalSuccessRate", score: 1.0, pass: true },
      { evaluatorId: "Builtin.Helpfulness", score: 0.94, pass: true },
    ],
  },
  {
    scenario_id: "curious-new-hire-benefits",
    stopped_by: "max_turns",
    turns: 6,
    transcript: [
      { turn: 1, role: "user", text: "Hi! I just joined — can you walk me through the benefits?" },
      { turn: 1, role: "agent", text: "Welcome aboard! Acme offers health insurance (3 plans), a 401k with company match, life insurance, and PTO. Where would you like to start?" },
      { turn: 1, role: "actor_reasoning", text: "Good overview. My goal needs the 401k match specifics first." },
      { turn: 2, role: "user", text: "What's the 401k match exactly?" },
      { turn: 2, role: "agent", text: "Acme matches 100% of your contributions up to 4% of salary, vested immediately." },
      { turn: 2, role: "actor_reasoning", text: "401k covered. Now I need at least one health plan explained." },
      { turn: 3, role: "user", text: "Nice. And the health plans?" },
      { turn: 3, role: "agent", text: "There are three: a PPO ($120/mo premium, low deductible), an HMO ($60/mo, network-only), and a high-deductible plan with HSA ($0/mo premium)." },
      { turn: 3, role: "actor_reasoning", text: "Both goal items are covered… but as a curious new hire I keep asking follow-ups instead of stopping." },
      { turn: 4, role: "user", text: "What does the HSA plan's deductible look like?" },
      { turn: 4, role: "agent", text: "The HDHP deductible is $1,600 individual / $3,200 family; Acme seeds the HSA with $500 annually." },
      { turn: 4, role: "actor_reasoning", text: "Interesting! One more question about dental." },
      { turn: 5, role: "user", text: "Is dental included in any of those?" },
      { turn: 5, role: "agent", text: "Dental is a separate rider — $15/mo, covers two cleanings a year and 50% of major work." },
      { turn: 5, role: "actor_reasoning", text: "Still curious about vision coverage too." },
      { turn: 6, role: "user", text: "And vision?" },
      { turn: 6, role: "agent", text: "Vision is bundled free with the PPO, or $8/mo standalone with the other plans." },
    ],
    scores: [
      { evaluatorId: "Builtin.GoalSuccessRate", score: 1.0, pass: true },
      { evaluatorId: "Builtin.Helpfulness", score: 0.9, pass: true },
    ],
  },
];
