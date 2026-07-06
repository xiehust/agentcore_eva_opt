import type { ToolDesc } from "../sim/types";

/**
 * Agent configuration — lifted verbatim from the Lab 4 notebook
 * (Lab4_AgentCore_Optimization.ipynb, cell 12) and hr_assistant_agent.py.
 */

/** The v1 system prompt — verbatim from the notebook. */
export const CURRENT_SYSTEM_PROMPT = `You are a helpful HR Assistant for Acme Corp.

You help employees with:
- Checking PTO (paid time off) balances
- Submitting PTO requests
- Looking up HR policies (PTO, remote work, parental leave, code of conduct)
- Understanding employee benefits (health, dental, vision, 401k, life insurance)
- Retrieving pay stub information

Always use the available tools to answer questions accurately. Do not make up
policy details, benefit amounts, or pay information — look them up.
Be concise, professional, and friendly.`;

/** The five v1 tool descriptions — verbatim from the notebook. */
export const CURRENT_TOOL_DESCRIPTIONS: Record<string, string> = {
  get_pto_balance: "Return the current PTO balance for an employee.",
  submit_pto_request: "Submit a PTO request for an employee.",
  lookup_hr_policy: "Look up a company HR policy document by topic.",
  get_benefits_summary: "Return a summary of a specific employee benefit.",
  get_pay_stub: "Retrieve a pay stub for an employee for a specific pay period.",
};

/** Ordered tool list for v1 (5 tools). */
export const CURRENT_TOOLS: ToolDesc[] = Object.entries(
  CURRENT_TOOL_DESCRIPTIONS,
).map(([name, description]) => ({ name, description }));

/** v2 adds an escalation tool (simulates a code change for target-based routing). */
export const V2_EXTRA_TOOL: ToolDesc = {
  name: "escalate_to_hr_manager",
  description:
    "Escalate a sensitive or unresolved employee issue (payroll disputes, " +
    "harassment reports, complex claims) to a human HR manager, creating a " +
    "tracked case and notifying the employee of next steps.",
};

/** v2 tool descriptions: the original five plus the escalation tool (6 total). */
export const V2_TOOL_DESCRIPTIONS: Record<string, string> = {
  ...CURRENT_TOOL_DESCRIPTIONS,
  [V2_EXTRA_TOOL.name]: V2_EXTRA_TOOL.description,
};

export const V2_TOOLS: ToolDesc[] = [...CURRENT_TOOLS, V2_EXTRA_TOOL];

/** v2's improved, code-baked system prompt (Step 8 target-based routing). */
export const V2_SYSTEM_PROMPT = `You are a senior HR Assistant for Acme Corp, equipped to resolve employee
requests end-to-end and to recognise when a human is needed.

For every request:
1. Identify the employee from the "Employee ID:" prefix and pass it to tools.
2. Use the available tools to retrieve authoritative data — never invent
   policy text, benefit amounts, dates, or pay figures.
3. For sensitive matters (payroll disputes, harassment, discrimination, or any
   issue a tool cannot resolve), call escalate_to_hr_manager and tell the
   employee a human will follow up.
4. Reply concisely and professionally: lead with the answer, then the brief
   supporting detail.`;

/**
 * Mock HR data summary — drawn from hr_assistant_agent.py — used purely for
 * display flavour in the UI (showing what the agent's tools "know").
 */
export const HR_MOCK_DATA = {
  employees: ["EMP-001", "EMP-002", "EMP-042"],
  ptoBalances: {
    "EMP-001": { total: 15, used: 5, remaining: 10 },
    "EMP-002": { total: 15, used: 12, remaining: 3 },
    "EMP-042": { total: 20, used: 7, remaining: 13 },
  },
  policies: ["pto", "remote_work", "parental_leave", "code_of_conduct"],
  benefits: ["health", "dental", "vision", "401k", "life_insurance"],
} as const;
