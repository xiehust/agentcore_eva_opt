/**
 * Representative HR prompts — lifted verbatim from the Lab 4 notebook.
 * BASELINE_PROMPTS  → cell 13 (10 sessions, with employee IDs)
 * GW_PROMPTS        → cell 39 (20 gateway sessions)
 * TARGET_PROMPTS    → cell 55 (10 target-based routing sessions)
 */

/** [employeeId, prompt] pairs for the baseline traffic (Step 3). */
export const BASELINE_PROMPTS: ReadonlyArray<readonly [string, string]> = [
  ["EMP-001", "What is my current PTO balance?"],
  [
    "EMP-001",
    "Please submit a PTO request for me from 2026-06-01 to 2026-06-05 for a family vacation.",
  ],
  ["EMP-001", "Can you pull up my January 2026 pay stub?"],
  ["EMP-002", "How many PTO days do I have left? I only joined recently."],
  ["EMP-042", "What's the company policy on working from home?"],
  [
    "EMP-001",
    "What are my health insurance options and how much does the company cover?",
  ],
  ["EMP-042", "Tell me about the 401k plan — how much does the company match?"],
  ["EMP-001", "What is the parental leave policy for primary caregivers?"],
  [
    "EMP-002",
    "I want to request time off from 2026-07-14 to 2026-07-18 for a medical procedure.",
  ],
  [
    "EMP-042",
    "Can you show me my December 2025 pay stub and explain the deductions?",
  ],
];

/** 20 gateway prompts for the config-bundle A/B test (Step 7). Verbatim. */
export const GW_PROMPTS: readonly string[] = [
  "Employee ID: EMP-001. What is my current PTO balance?",
  "Employee ID: EMP-001. I need to request leave from 2026-08-04 to 2026-08-08 for a vacation.",
  "Employee ID: EMP-042. Can you explain our 401k matching policy?",
  "Employee ID: EMP-002. I only have a few days left. What exactly is the PTO rollover policy?",
  "Employee ID: EMP-001. Show me my January 2026 pay stub and explain the deductions.",
  "Employee ID: EMP-042. What are my health insurance options?",
  "Employee ID: EMP-001. What's the remote work policy at Acme?",
  "Employee ID: EMP-002. I need to take parental leave soon. How many weeks am I entitled to?",
  "Employee ID: EMP-042. Please submit a PTO request for 2026-09-01 to 2026-09-03 for personal reasons.",
  "Employee ID: EMP-001. How much life insurance does the company provide?",
  "Employee ID: EMP-001. Request time off from 2026-07-21 to 2026-07-25 for a family trip.",
  "Employee ID: EMP-042. What dental coverage do we have for major restorative work?",
  "Employee ID: EMP-002. I want to check my PTO balance before requesting leave.",
  "Employee ID: EMP-001. Can I work from home 4 days a week?",
  "Employee ID: EMP-042. What's the vision insurance allowance for contacts?",
  "Employee ID: EMP-001. Submit PTO for me: 2026-10-13 to 2026-10-14 for doctor appointments.",
  "Employee ID: EMP-002. Explain the 401k vesting schedule.",
  "Employee ID: EMP-042. What's the code of conduct policy around harassment?",
  "Employee ID: EMP-001. How much does the company contribute to health premiums for family coverage?",
  "Employee ID: EMP-042. Can you pull up my January 2026 pay stub?",
];

/** 10 target-based routing prompts (Step 8). Verbatim. */
export const TARGET_PROMPTS: readonly string[] = [
  "Employee ID: EMP-001. Check my PTO balance and submit a request for 2026-11-24 to 2026-11-28.",
  "Employee ID: EMP-042. I have a payroll dispute. Can you escalate this to an HR manager?",
  "Employee ID: EMP-002. What benefits can I enroll in during open enrollment?",
  "Employee ID: EMP-001. What's the maximum PTO carryover allowed?",
  "Employee ID: EMP-042. My manager is creating a hostile work environment. I need help.",
  "Employee ID: EMP-001. How many weeks of parental leave will I get as a primary caregiver?",
  "Employee ID: EMP-002. Pull up my pay stub for January 2026.",
  "Employee ID: EMP-001. Can I take PTO before I've fully accrued the days?",
  "Employee ID: EMP-042. I need a dental claim reviewed — can you escalate?",
  "Employee ID: EMP-001. What vision insurance benefits do we have?",
];
