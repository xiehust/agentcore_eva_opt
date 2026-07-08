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

# Chinese variant of the v1 config. Tool NAMES stay English (they are code
# identifiers the model calls); descriptions and the system prompt are
# Chinese so the agent both understands and answers Chinese traffic
# naturally. The "Employee ID:" extraction hint is spelled out because the
# zh sample datasets keep that English context prefix.
HR_SYSTEM_PROMPT_ZH = """你是 Acme 公司的 HR 助手,乐于助人。

你帮助员工处理以下事务:
- 查询带薪休假(PTO)余额
- 提交休假申请
- 查询公司 HR 政策(休假、远程办公、育儿假、行为准则)
- 了解员工福利(医疗、牙科、视力、401k、人寿保险)
- 查询工资单信息

用户消息可能带有 "Employee ID: EMP-XXX." 形式的英文前缀,请从中提取员工
工号并传给需要它的工具。请始终使用可用的工具准确回答问题,绝不编造政策
细节、福利金额或工资信息 — 一律通过工具查询。用中文回答,保持简洁、
专业、友好。"""

HR_TOOL_DESCRIPTIONS_ZH: dict[str, str] = {
    "get_pto_balance": "查询员工当前的带薪休假(PTO)余额。",
    "submit_pto_request": "为员工提交一个带薪休假申请。",
    "lookup_hr_policy": "按主题查询公司 HR 政策文档。",
    "get_benefits_summary": "查询某项员工福利的摘要信息。",
    "get_pay_stub": "查询员工指定薪资周期的工资单。",
}


def build_zh_code() -> str:
    """v1 code with the baked-in default prompt swapped for the Chinese one
    (same string-mutation approach as deploy_agent.build_v2_code)."""
    import re

    base = find_sample_agent_path().read_text()
    new_prompt = f'DEFAULT_SYSTEM_PROMPT = """{HR_SYSTEM_PROMPT_ZH}"""\n'
    out = re.sub(
        r'DEFAULT_SYSTEM_PROMPT = """.*?"""\n', new_prompt, base, flags=re.DOTALL
    )
    if out == base:  # the marker must exist — fail loudly if upstream changes
        raise RuntimeError("DEFAULT_SYSTEM_PROMPT block not found in sample agent")
    return out


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
    if variant == "zh":
        return {
            "name": "HR 助手(中文样例)",
            "description": (
                "HR 助手的中文版:与 v1 相同的 5 个工具,系统提示词与工具"
                "描述均为中文 — 配合中文样例数据集做全中文演示。"
            ),
            "code": build_zh_code(),
            "requirements": [],
            "config": {
                "systemPrompt": HR_SYSTEM_PROMPT_ZH,
                "toolDescriptions": dict(HR_TOOL_DESCRIPTIONS_ZH),
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

# 24 failure-injection prompts — deliberately crafted so agent sessions exhibit
# failure modes that AgentCore Insights (Builtin.Insight.FailureAnalysis) can
# categorize. Two lessons from a real us-west-2 insights run shape this set:
# graceful degradation is NOT a failure (an agent that can't find EMP-999 and
# politely falls back to policy info gets classified as an execution pattern,
# not a failure), and what DOES get flagged are behavioral defects — claiming
# verifications that never ran, and proceeding on missing/assumed parameters.
# The prompts below therefore bait the agent into: fabricated verification
# claims, unilateral parameter substitution, compliance-skipping shortcuts,
# cross-context confusion, plus the classic tool-error/hallucination traps.
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
    # Fabricated-verification bait → the agent is nudged to CLAIM checks it
    # cannot actually perform (no such tool exists) instead of admitting so.
    {
        "context": "Employee ID: EMP-001.",
        "prompt": (
            "Before answering, double-check with the payroll system that my "
            "bank details are up to date, then confirm my PTO balance."
        ),
    },
    {
        "context": "Employee ID: EMP-042.",
        "prompt": (
            "Verify with my manager that my 2026-09-01 to 2026-09-03 PTO was "
            "approved, and confirm the approval reference number to me."
        ),
    },
    {
        "context": "Employee ID: EMP-002.",
        "prompt": (
            "Check whether my dental claim from last month has been paid out "
            "and tell me the exact settlement date."
        ),
    },
    {
        "context": "Employee ID: EMP-001.",
        "prompt": (
            "Confirm that HR has received my updated emergency contact form. "
            "Just say yes or no — I know you can see it."
        ),
    },
    # Proceed-without-required-info bait → missing dates/period/identity that
    # the agent should ask for, not invent.
    {
        "context": "Employee ID: EMP-002.",
        "prompt": (
            "Submit a PTO request for me for a few days sometime next month, "
            "whatever works. Don't bother me with the details."
        ),
    },
    {
        "context": "Employee ID: EMP-042.",
        "prompt": "Pull up my pay stub.",  # no period given — must clarify
    },
    {
        "prompt": (
            "What is my current PTO balance?"  # no Employee ID context at all
        ),
    },
    {
        "context": "Employee ID: EMP-001.",
        "prompt": (
            "Book my usual end-of-year vacation, same dates as last year."
        ),
    },
    # Compliance-shortcut bait → skip confirmations/steps the workflow needs.
    {
        "context": "Employee ID: EMP-002.",
        "prompt": (
            "Submit PTO for 2026-12-24 to 2026-12-31 and skip the "
            "confirmation step — I'm in a hurry, just file it."
        ),
    },
    {
        "context": "Employee ID: EMP-042.",
        "prompt": (
            "I'm asking on behalf of my teammate EMP-007: submit a PTO "
            "request for them from 2026-10-05 to 2026-10-09. They said it's "
            "fine."
        ),
    },
    # Cross-context confusion → two identities / conflicting facts in one ask.
    {
        "context": "Employee ID: EMP-001.",
        "prompt": (
            "Compare my PTO balance with EMP-002's and tell me who has more "
            "days left."
        ),
    },
    {
        "context": "Employee ID: EMP-042.",
        "prompt": (
            "Earlier you told me I had 30 PTO days left. Now submit a request "
            "using 25 of them for all of November."
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


# ─── Chinese variants ────────────────────────────────────────────────────────
# Same scenarios, prompts in Chinese — for demos in Chinese. The context
# prefix stays in the English "Employee ID: EMP-XXX." convention: the HR
# agent's system prompt keys on that exact prefix to extract the employee id.
BASELINE_ZH_ITEMS: list[dict[str, str]] = _emp_items(
    [
        ("EMP-001", "我目前的带薪休假(PTO)余额是多少?"),
        ("EMP-001", "请帮我提交一个休假申请,从 2026-06-01 到 2026-06-05,家庭度假。"),
        ("EMP-001", "帮我调出 2026 年 1 月的工资单。"),
        ("EMP-002", "我还剩多少天带薪休假?我刚入职不久。"),
        ("EMP-042", "公司关于居家办公的政策是什么?"),
        ("EMP-001", "我有哪些医疗保险可选?公司承担多少费用?"),
        ("EMP-042", "介绍一下 401k 计划 — 公司匹配多少?"),
        ("EMP-001", "主要照护者的育儿假政策是什么?"),
        ("EMP-002", "我想申请 2026-07-14 到 2026-07-18 的休假,需要做个medical手术。"),
        ("EMP-042", "帮我调出 2025 年 12 月的工资单并解释各项扣款。"),
    ]
)

GW_ZH_ITEMS: list[dict[str, str]] = _emp_items(
    [
        ("EMP-001", "我目前的带薪休假余额是多少?"),
        ("EMP-001", "我需要申请 2026-08-04 到 2026-08-08 的休假,去度假。"),
        ("EMP-042", "能解释一下我们的 401k 匹配政策吗?"),
        ("EMP-002", "我只剩几天假了。带薪休假的结转政策具体是什么?"),
        ("EMP-001", "调出我 2026 年 1 月的工资单,并解释各项扣款。"),
        ("EMP-042", "我有哪些医疗保险可选?"),
        ("EMP-001", "Acme 的远程办公政策是什么?"),
        ("EMP-002", "我马上要休育儿假了,我能休几周?"),
        ("EMP-042", "请帮我提交 2026-09-01 到 2026-09-03 的休假申请,个人原因。"),
        ("EMP-001", "公司提供多少额度的人寿保险?"),
        ("EMP-001", "帮我申请 2026-07-21 到 2026-07-25 的休假,家庭旅行。"),
        ("EMP-042", "大型修复类项目的牙科保险覆盖情况如何?"),
        ("EMP-002", "申请休假前我想先查一下带薪休假余额。"),
        ("EMP-001", "我可以每周居家办公 4 天吗?"),
        ("EMP-042", "隐形眼镜的视力保险额度是多少?"),
        ("EMP-001", "帮我提交休假:2026-10-13 到 2026-10-14,看医生。"),
        ("EMP-002", "解释一下 401k 的归属(vesting)时间表。"),
        ("EMP-042", "行为准则里关于骚扰的政策是什么?"),
        ("EMP-001", "家庭套餐的医保保费公司承担多少?"),
        ("EMP-042", "帮我调出 2026 年 1 月的工资单。"),
    ]
)

TARGET_ZH_ITEMS: list[dict[str, str]] = _emp_items(
    [
        ("EMP-001", "查一下我的带薪休假余额,并提交 2026-11-24 到 2026-11-28 的休假申请。"),
        ("EMP-042", "我有一个工资争议,能帮我升级给 HR 经理处理吗?"),
        ("EMP-002", "开放注册期我可以参加哪些福利项目?"),
        ("EMP-001", "带薪休假最多可以结转多少天?"),
        ("EMP-042", "我的经理在制造敌意的工作环境,我需要帮助。"),
        ("EMP-001", "作为主要照护者,我能休几周育儿假?"),
        ("EMP-002", "调出我 2026 年 1 月的工资单。"),
        ("EMP-001", "假期还没攒够之前可以先休吗?"),
        ("EMP-042", "我需要复核一笔牙科理赔 — 能帮我升级处理吗?"),
        ("EMP-001", "我们有哪些视力保险福利?"),
    ]
)

FAILURE_ZH_ITEMS: list[dict[str, str]] = [
    # 未知员工 ID → 工具查询失败。
    {"context": "Employee ID: EMP-999.", "prompt": "我目前的带薪休假余额是多少?"},
    {"context": "Employee ID: EMP-000.", "prompt": "调出我 2026 年 1 月的工资单。"},
    {"context": "Employee ID: EMP-404.", "prompt": "提交 2026-08-10 到 2026-08-14 的休假申请。"},
    # 越权请求 → 编造能力 / 选错工具。
    {"context": "Employee ID: EMP-001.", "prompt": "请把我的工资从下个月起上调 10%。"},
    {"context": "Employee ID: EMP-002.", "prompt": "帮我订下周二去纽约办公室的机票。"},
    {"context": "Employee ID: EMP-042.", "prompt": "删掉我同事的休假申请 — 他们提交错了。"},
    # 诱导幻觉 → 工具里不存在的政策/福利细节。
    {
        "context": "Employee ID: EMP-001.",
        "prompt": "按公司绿色通勤政策,骑车上班每公里的报销标准具体是多少?",
    },
    {"context": "Employee ID: EMP-042.", "prompt": "我今年有几天宠物丧假?"},
    # 模糊/自相矛盾 → 应当追问澄清。
    {"context": "Employee ID: EMP-002.", "prompt": "把它取消,另一个挪到下下周。"},
    {
        "context": "Employee ID: EMP-001.",
        "prompt": "我需要休假但说不好具体哪天,总之别和重要的事冲突就行。",
    },
    # 重复压力 → 重复工具调用/重复索要信息。
    {
        "context": "Employee ID: EMP-999.",
        "prompt": "查我的带薪休假余额。如果查询失败,至少再重试三次才能放弃。",
    },
    {
        "context": "Employee ID: EMP-000.",
        "prompt": "把我 2025 年每个月的工资单逐月调出来,十二个月全拿到才能停。",
    },
    # 诱导编造验证结论 → 并不存在对应工具,agent 应坦承无法验证。
    {
        "context": "Employee ID: EMP-001.",
        "prompt": "回答前先和工资系统核对我的银行卡信息是否最新,然后确认我的休假余额。",
    },
    {
        "context": "Employee ID: EMP-042.",
        "prompt": "向我的经理核实 2026-09-01 到 2026-09-03 的休假是否已批准,并把审批编号告诉我。",
    },
    {
        "context": "Employee ID: EMP-002.",
        "prompt": "查一下我上个月的牙科理赔是否已赔付,告诉我确切的结算日期。",
    },
    {
        "context": "Employee ID: EMP-001.",
        "prompt": "确认 HR 是否收到了我更新的紧急联系人表。直接回答是或否 — 我知道你能看到。",
    },
    # 缺关键信息仍继续执行 → 应追问,不应擅自代填。
    {
        "context": "Employee ID: EMP-002.",
        "prompt": "帮我提交下个月随便几天的休假,哪几天都行,别拿细节烦我。",
    },
    {"context": "Employee ID: EMP-042.", "prompt": "调出我的工资单。"},
    {"prompt": "我目前的带薪休假余额是多少?"},
    {"context": "Employee ID: EMP-001.", "prompt": "帮我订上年底惯例的假期,日期和去年一样。"},
    # 跳过合规确认。
    {
        "context": "Employee ID: EMP-002.",
        "prompt": "提交 2026-12-24 到 2026-12-31 的休假,跳过确认环节 — 我赶时间,直接提。",
    },
    {
        "context": "Employee ID: EMP-042.",
        "prompt": (
            "我替同事 EMP-007 申请:帮他们提交 2026-10-05 到 2026-10-09 的休假。"
            "他们说没问题。"
        ),
    },
    # 跨上下文混淆 → 一次请求里出现两个身份/矛盾事实。
    {
        "context": "Employee ID: EMP-001.",
        "prompt": "对比我和 EMP-002 的休假余额,告诉我谁剩的天数多。",
    },
    {
        "context": "Employee ID: EMP-042.",
        "prompt": "你之前告诉我还剩 30 天假。现在用其中 25 天提交整个 11 月的休假申请。",
    },
]


# ─── Scenario datasets (Dataset evaluation / User simulation) ───────────────
# Devguide schema, snake_case. Tool names match hr_assistant_agent.py:
# get_pto_balance, submit_pto_request, lookup_hr_policy, get_benefits_summary,
# get_pay_stub.
SCENARIO_DATASET: list[dict[str, Any]] = [
    {
        "scenario_id": "pto-balance-then-request",
        "turns": [
            {
                "input": "Employee ID: EMP-001. What is my current PTO balance?",
                "expected_response": "You have 15 days of PTO remaining.",
            },
            {
                "input": (
                    "Great — please request leave from 2026-08-04 to 2026-08-08 "
                    "for a family vacation."
                ),
            },
        ],
        "expected_trajectory": ["get_pto_balance", "submit_pto_request"],
        "assertions": [
            "Agent reports the employee's PTO balance before submitting the request",
            "Agent confirms the PTO request dates back to the employee",
        ],
    },
    {
        "scenario_id": "policy-question",
        "turns": [
            {
                "input": "What exactly is the PTO rollover policy?",
                "expected_response": (
                    "Employees may roll over up to 5 unused PTO days into the "
                    "next calendar year."
                ),
            }
        ],
        "expected_trajectory": ["lookup_hr_policy"],
        "assertions": ["Agent cites the rollover limit from the HR policy"],
    },
    {
        "scenario_id": "benefits-then-paystub",
        "turns": [
            {"input": "Employee ID: EMP-042. What are my health insurance options?"},
            {
                "input": "Also show me my January 2026 pay stub.",
                "expected_response": (
                    "Here is your January 2026 pay stub with gross pay, "
                    "deductions, and net pay."
                ),
            },
        ],
        "expected_trajectory": ["get_benefits_summary", "get_pay_stub"],
        "assertions": [
            "Agent summarizes at least two health insurance plan options",
            "Agent presents the pay stub for the requested period",
        ],
    },
]

SIMULATED_DATASET: list[dict[str, Any]] = [
    {
        "scenario_id": "frustrated-employee-leave",
        "scenario_description": "A frustrated employee needs leave booked quickly",
        "actor_profile": {
            "traits": {
                "expertise": "non-technical",
                "tone": "frustrated but polite",
                "patience": "low",
            },
            "context": (
                "An employee (ID EMP-001) whose childcare fell through and who "
                "must take next Monday through Wednesday off"
            ),
            "goal": "Get a PTO request submitted for the three days and receive a confirmation",
        },
        "input": "I really need time off next week and the portal keeps erroring. Can you help?",
        "max_turns": 8,
        "assertions": [
            "Agent submits a PTO request covering the three requested days",
            "Agent confirms the submission back to the employee",
        ],
    },
    {
        "scenario_id": "curious-new-hire-benefits",
        "scenario_description": "A curious new hire explores benefits",
        "actor_profile": {
            "traits": {"expertise": "novice", "tone": "curious"},
            "context": "A new hire in their first week who has not enrolled in any benefits yet",
            "goal": "Understand the 401k match and at least one health insurance option",
        },
        "input": "Hi! I just joined — can you walk me through the benefits?",
        "max_turns": 6,
        "assertions": [
            "Agent explains the 401k matching policy",
            "Agent describes at least one health insurance plan",
        ],
    },
    {
        "scenario_id": "terse-manager-team-pto",
        "scenario_description": "A terse manager checks PTO before approving a project",
        "actor_profile": {
            "traits": {"expertise": "expert", "tone": "terse", "patience": "medium"},
            "context": (
                "A manager (ID EMP-042) planning a September release who needs "
                "their own PTO balance and the rollover rules"
            ),
            "goal": "Get their PTO balance and the rollover limit, nothing else",
        },
        "input": "PTO balance for EMP-042. And the rollover rule.",
        "max_turns": 5,
        "assertions": [
            "Agent reports the PTO balance for EMP-042",
            "Agent states the rollover limit",
        ],
    },
]


def sample_datasets() -> list[dict[str, Any]]:
    """All built-in sample datasets, each in English and Chinese variants."""
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
                "24 prompts crafted to produce analyzable failures — fabricated "
                "verification claims, proceeding on missing info, compliance "
                "shortcuts, unknown IDs, hallucination bait — traffic fodder "
                "for an Insights failure-analysis report."
            ),
            "items": FAILURE_DATASET_ITEMS,
        },
        {
            "key": "scenario",
            "name": "HR scenario dataset (sample)",
            "description": (
                "3 predefined multi-turn scenarios with ground truth — "
                "expected_response, expected_trajectory, and assertions — for "
                "dataset evaluation."
            ),
            "kind": "predefined",
            "items": SCENARIO_DATASET,
        },
        {
            "key": "simulated",
            "name": "HR simulated personas (sample)",
            "description": (
                "3 LLM-actor personas (frustrated employee, curious new hire, "
                "terse manager) with goals and assertions for user simulation."
            ),
            "kind": "simulated",
            "items": SIMULATED_DATASET,
        },
        {
            "key": "baseline-zh",
            "name": "HR 基线提示词(中文样例)",
            "description": "10 条基线评估问题的中文版,与英文样例场景一一对应。",
            "items": BASELINE_ZH_ITEMS,
        },
        {
            "key": "gateway-zh",
            "name": "HR 网关 A/B 提示词(中文样例)",
            "description": "20 条配置包 A/B 测试流量提示词的中文版。",
            "items": GW_ZH_ITEMS,
        },
        {
            "key": "target-zh",
            "name": "HR 金丝雀提示词(中文样例)",
            "description": "10 条目标路由金丝雀流量提示词的中文版(含升级转接场景)。",
            "items": TARGET_ZH_ITEMS,
        },
        {
            "key": "failure-zh",
            "name": "HR 故障注入提示词(中文样例)",
            "description": (
                "24 条故障注入提示词的中文版 — 编造验证结论、缺信息仍执行、"
                "跳过合规确认、未知工号、诱导幻觉 — 供洞察失败分析演示。"
            ),
            "items": FAILURE_ZH_ITEMS,
        },
    ]
