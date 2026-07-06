import { CURRENT_TOOL_DESCRIPTIONS } from "./agent";

/**
 * AI-generated optimization recommendations (Step 5). In the real notebook
 * these come from `start_recommendation` analysing production traces; here they
 * are authored to be believable, materially-improved rewrites.
 */

/** Recommended system prompt — richer guidance, explicit tool-use protocol. */
export const RECOMMENDED_SYSTEM_PROMPT = `You are the HR Assistant for Acme Corp. Your job is to resolve employee HR
questions accurately and efficiently using only authoritative tool data.

Operating procedure — follow on every turn:
1. Extract the employee identifier from the "Employee ID:" prefix and pass it
   to every tool call that needs it. If it is missing, ask for it before
   proceeding.
2. Choose the single most relevant tool for the request:
   - PTO balance questions  → get_pto_balance
   - Time-off requests      → submit_pto_request (confirm the exact start/end
     dates back to the employee before submitting)
   - Policy questions       → lookup_hr_policy (pto, remote_work,
     parental_leave, code_of_conduct)
   - Benefits questions      → get_benefits_summary (health, dental, vision,
     401k, life_insurance)
   - Pay stub questions     → get_pay_stub (confirm the pay period)
3. Never invent or estimate policy text, benefit amounts, dates, or pay
   figures — always look them up. If a tool returns nothing, say so plainly.
4. Respond concisely and professionally: lead with the direct answer, then one
   or two lines of supporting detail. Use the employee's data, not generic
   statements.`;

/** Recommended tool descriptions — more specific, parameter- and intent-aware. */
export const RECOMMENDED_TOOL_DESCRIPTIONS: Record<string, string> = {
  get_pto_balance:
    "Return an employee's current paid-time-off balance — total accrued, days " +
    "used, and remaining days. Call this for any question about how much PTO, " +
    "vacation, or leave an employee has left. Requires the employee ID.",
  submit_pto_request:
    "Submit a paid-time-off request for an employee over a specific date range. " +
    "Use for any request to book, take, or schedule time off, vacation, or " +
    "leave. Requires the employee ID and explicit start and end dates; confirm " +
    "the dates with the employee before submitting.",
  lookup_hr_policy:
    "Look up the authoritative text of a company HR policy by topic. Valid " +
    "topics: pto, remote_work, parental_leave, code_of_conduct. Use whenever an " +
    "employee asks what a policy says or how a rule works, rather than answering " +
    "from memory.",
  get_benefits_summary:
    "Return the detailed summary of a specific employee benefit. Valid benefits: " +
    "health, dental, vision, 401k, life_insurance. Use for questions about " +
    "coverage, premiums, employer match, deductibles, or enrollment for a named " +
    "benefit.",
  get_pay_stub:
    "Retrieve an employee's pay stub for a specific pay period, including gross " +
    "pay, deductions, and net pay. Use for any request to view, pull up, or " +
    "explain a paycheck or pay stub. Requires the employee ID and the pay period " +
    "(month and year).",
};

/** Sanity helper used by tests: every recommended description is richer. */
export function recommendedIsRicher(): boolean {
  return Object.keys(CURRENT_TOOL_DESCRIPTIONS).every(
    (k) =>
      (RECOMMENDED_TOOL_DESCRIPTIONS[k]?.length ?? 0) >
      CURRENT_TOOL_DESCRIPTIONS[k].length,
  );
}
