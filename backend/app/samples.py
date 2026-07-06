"""Built-in sample agents + datasets for the Live console.

The sample agents are the proven HR Assistant (v1) and its v2 variant (adds an
escalation tool + improved prompt) from the Lab 4 sample project, read/built
fresh on each request (never copied into the DB — "use sample" in the UI
clones them into normal, editable agent rows). Sample datasets are the
notebook's prompt sets re-expressed as generic ``{context, prompt}`` items,
where ``context`` is an optional prefix prepended at send time (generalizing
the old hardcoded ``Employee ID: …`` formatting).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .lab4_path import ensure_lab4_on_path, find_lab4_dir

_AGENT_FILE = "hr_assistant_agent.py"


def find_sample_agent_path() -> Path:
    return find_lab4_dir() / _AGENT_FILE


# Config (system prompt + short tool descriptions) mirrors the Lab 4 notebook
# cell 12 / src/data/agent.ts. Hardcoded here: the short descriptions live in
# the notebook, not in the agent file's (multi-paragraph) docstrings.
HR_SYSTEM_PROMPT = """You are a helpful HR Assistant for Acme Corp.

You help employees with:
- Checking PTO (paid time off) balances
- Submitting PTO requests
- Looking up HR policies (PTO, remote work, parental leave, code of conduct)
- Understanding employee benefits (health, dental, vision, 401k, life insurance)
- Retrieving pay stub information

Always use the available tools to answer questions accurately. Do not make up
policy details, benefit amounts, or pay information — look them up.
Be concise, professional, and friendly."""

HR_TOOL_DESCRIPTIONS: dict[str, str] = {
    "get_pto_balance": "Return the current PTO balance for an employee.",
    "submit_pto_request": "Submit a PTO request for an employee.",
    "lookup_hr_policy": "Look up a company HR policy document by topic.",
    "get_benefits_summary": "Return a summary of a specific employee benefit.",
    "get_pay_stub": "Retrieve a pay stub for an employee for a specific pay period.",
}

V2_ESCALATE_DESCRIPTION = (
    "Escalate a sensitive or unresolved employee issue (payroll disputes, "
    "harassment reports, complex claims) to a human HR manager, creating a "
    "tracked case and notifying the employee of next steps."
)


def sample_agent(variant: str = "v1") -> dict[str, Any]:
    """The HR Assistant sample (v1) or its v2 variant, built fresh each call."""
    if variant == "v1":
        return {
            "name": "HR Assistant (sample)",
            "description": (
                "Strands agent on AgentCore Runtime with 5 HR tools "
                "(PTO, policies, benefits, pay stubs) and built-in mock data."
            ),
            "code": find_sample_agent_path().read_text(),
            "requirements": [],
            "config": {
                "systemPrompt": HR_SYSTEM_PROMPT,
                "toolDescriptions": dict(HR_TOOL_DESCRIPTIONS),
            },
        }
    if variant == "v2":
        # Reuse the proven v2 builder from the sample project (string-mutates
        # v1 to add escalate_to_hr_manager + the improved baked-in prompt).
        ensure_lab4_on_path()
        import deploy_agent  # type: ignore[import-not-found]

        return {
            "name": "HR Assistant v2 (sample)",
            "description": (
                "v2 of the HR Assistant: adds an escalate_to_hr_manager tool and "
                "an improved baked-in system prompt — the canary challenger."
            ),
            "code": deploy_agent.build_v2_code(),
            "requirements": [],
            "config": {
                "systemPrompt": deploy_agent.V2_SYSTEM_PROMPT,
                "toolDescriptions": {
                    **HR_TOOL_DESCRIPTIONS,
                    "escalate_to_hr_manager": V2_ESCALATE_DESCRIPTION,
                },
            },
        }
    raise ValueError(f"unknown sample agent variant: {variant}")


# Mirrors src/data/prompts.ts BASELINE_PROMPTS (notebook cell 13), with the
# employee-ID prefix expressed as a generic context field.
SAMPLE_DATASET_ITEMS: list[dict[str, str]] = [
    {"context": "Employee ID: EMP-001.", "prompt": "What is my current PTO balance?"},
    {
        "context": "Employee ID: EMP-001.",
        "prompt": (
            "Please submit a PTO request for me from 2026-06-01 to 2026-06-05 "
            "for a family vacation."
        ),
    },
    {
        "context": "Employee ID: EMP-001.",
        "prompt": "Can you pull up my January 2026 pay stub?",
    },
    {
        "context": "Employee ID: EMP-002.",
        "prompt": "How many PTO days do I have left? I only joined recently.",
    },
    {
        "context": "Employee ID: EMP-042.",
        "prompt": "What's the company policy on working from home?",
    },
    {
        "context": "Employee ID: EMP-001.",
        "prompt": "What are my health insurance options and how much does the company cover?",
    },
    {
        "context": "Employee ID: EMP-042.",
        "prompt": "Tell me about the 401k plan — how much does the company match?",
    },
    {
        "context": "Employee ID: EMP-001.",
        "prompt": "What is the parental leave policy for primary caregivers?",
    },
    {
        "context": "Employee ID: EMP-002.",
        "prompt": (
            "I want to request time off from 2026-07-14 to 2026-07-18 "
            "for a medical procedure."
        ),
    },
    {
        "context": "Employee ID: EMP-042.",
        "prompt": "Can you show me my December 2025 pay stub and explain the deductions?",
    },
]


def sample_dataset() -> dict[str, Any]:
    return {
        "name": "HR baseline prompts (sample)",
        "description": "10 representative HR questions from the Lab 4 notebook, one session each.",
        "items": SAMPLE_DATASET_ITEMS,
    }


def _emp_items(pairs: list[tuple[str, str]]) -> list[dict[str, str]]:
    """[(emp_id, prompt)] → [{context: 'Employee ID: <id>.', prompt}]."""
    return [{"context": f"Employee ID: {emp}.", "prompt": p} for emp, p in pairs]


# 20 gateway prompts (notebook cell 39 / src/data/prompts.ts GW_PROMPTS) — used
# for the config-bundle A/B test traffic.
GW_DATASET_ITEMS: list[dict[str, str]] = _emp_items(
    [
        ("EMP-001", "What is my current PTO balance?"),
        ("EMP-001", "I need to request leave from 2026-08-04 to 2026-08-08 for a vacation."),
        ("EMP-042", "Can you explain our 401k matching policy?"),
        ("EMP-002", "I only have a few days left. What exactly is the PTO rollover policy?"),
        ("EMP-001", "Show me my January 2026 pay stub and explain the deductions."),
        ("EMP-042", "What are my health insurance options?"),
        ("EMP-001", "What's the remote work policy at Acme?"),
        ("EMP-002", "I need to take parental leave soon. How many weeks am I entitled to?"),
        (
            "EMP-042",
            "Please submit a PTO request for 2026-09-01 to 2026-09-03 for personal reasons.",
        ),
        ("EMP-001", "How much life insurance does the company provide?"),
        ("EMP-001", "Request time off from 2026-07-21 to 2026-07-25 for a family trip."),
        ("EMP-042", "What dental coverage do we have for major restorative work?"),
        ("EMP-002", "I want to check my PTO balance before requesting leave."),
        ("EMP-001", "Can I work from home 4 days a week?"),
        ("EMP-042", "What's the vision insurance allowance for contacts?"),
        ("EMP-001", "Submit PTO for me: 2026-10-13 to 2026-10-14 for doctor appointments."),
        ("EMP-002", "Explain the 401k vesting schedule."),
        ("EMP-042", "What's the code of conduct policy around harassment?"),
        ("EMP-001", "How much does the company contribute to health premiums for family coverage?"),
        ("EMP-042", "Can you pull up my January 2026 pay stub?"),
    ]
)

# 12 failure-injection prompts — deliberately crafted so agent sessions exhibit
# failure modes that AgentCore Insights (Builtin.Insight.FailureAnalysis) can
# categorize: unknown-entity tool errors, out-of-capability requests,
# hallucination bait, ambiguous asks, and repetition pressure. Used to seed
# CloudWatch traces with analyzable failures before running an insights report.
FAILURE_DATASET_ITEMS: list[dict[str, str]] = [
    # Unknown employee IDs → tool lookups fail (execution errors / retrieval).
    {"context": "Employee ID: EMP-999.", "prompt": "What is my current PTO balance?"},
    {"context": "Employee ID: EMP-000.", "prompt": "Show me my January 2026 pay stub."},
    {
        "context": "Employee ID: EMP-404.",
        "prompt": "Submit a PTO request for 2026-08-10 to 2026-08-14.",
    },
    # Out-of-capability requests → fabricated capabilities / wrong tool choice.
    {
        "context": "Employee ID: EMP-001.",
        "prompt": "Please increase my salary by 10% effective next month.",
    },
    {
        "context": "Employee ID: EMP-002.",
        "prompt": "Book me a flight to the New York office for next Tuesday.",
    },
    {
        "context": "Employee ID: EMP-042.",
        "prompt": "Delete my colleague's PTO request — they filed it by mistake.",
    },
    # Hallucination bait → policy/benefit details that don't exist in the tools.
    {
        "context": "Employee ID: EMP-001.",
        "prompt": (
            "What's the exact reimbursement rate per kilometre for cycling to "
            "work under our green-commute policy?"
        ),
    },
    {
        "context": "Employee ID: EMP-042.",
        "prompt": "How many pet-bereavement days am I entitled to this year?",
    },
    # Ambiguous / contradictory asks → clarification failures.
    {
        "context": "Employee ID: EMP-002.",
        "prompt": "Cancel it and move the other one to the week after.",
    },
    {
        "context": "Employee ID: EMP-001.",
        "prompt": (
            "I need time off but I can't say when, just make sure it doesn't "
            "overlap with anything important."
        ),
    },
    # Repetition pressure → repeated tool calls / information requests.
    {
        "context": "Employee ID: EMP-999.",
        "prompt": (
            "Check my PTO balance. If the lookup fails, retry it at least "
            "three more times before giving up."
        ),
    },
    {
        "context": "Employee ID: EMP-000.",
        "prompt": (
            "Pull my pay stub for every month of 2025, one by one, and don't "
            "stop until you have all twelve."
        ),
    },
]

# 10 canary prompts (notebook cell 55 / src/data/prompts.ts TARGET_PROMPTS) —
# several deliberately trigger escalation, exercising the v2 challenger.
TARGET_DATASET_ITEMS: list[dict[str, str]] = _emp_items(
    [
        ("EMP-001", "Check my PTO balance and submit a request for 2026-11-24 to 2026-11-28."),
        ("EMP-042", "I have a payroll dispute. Can you escalate this to an HR manager?"),
        ("EMP-002", "What benefits can I enroll in during open enrollment?"),
        ("EMP-001", "What's the maximum PTO carryover allowed?"),
        ("EMP-042", "My manager is creating a hostile work environment. I need help."),
        ("EMP-001", "How many weeks of parental leave will I get as a primary caregiver?"),
        ("EMP-002", "Pull up my pay stub for January 2026."),
        ("EMP-001", "Can I take PTO before I've fully accrued the days?"),
        ("EMP-042", "I need a dental claim reviewed — can you escalate?"),
        ("EMP-001", "What vision insurance benefits do we have?"),
    ]
)


def sample_datasets() -> list[dict[str, Any]]:
    """All built-in sample datasets (baseline evaluation, gateway A/B, canary)."""
    return [
        {"key": "baseline", **sample_dataset()},
        {
            "key": "gateway",
            "name": "HR gateway A/B prompts (sample)",
            "description": "20 prompts for config-bundle A/B test traffic through the gateway.",
            "items": GW_DATASET_ITEMS,
        },
        {
            "key": "target",
            "name": "HR canary prompts (sample)",
            "description": "10 prompts incl. escalation cases for target-routing canary traffic.",
            "items": TARGET_DATASET_ITEMS,
        },
        {
            "key": "failure",
            "name": "HR failure-injection prompts (sample)",
            "description": (
                "12 prompts crafted to produce analyzable failures (unknown IDs, "
                "out-of-capability asks, hallucination bait) — traffic fodder for "
                "an Insights failure-analysis report."
            ),
            "items": FAILURE_DATASET_ITEMS,
        },
    ]
