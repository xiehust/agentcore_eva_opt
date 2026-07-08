"""HTTP surface of the demo external agent.

POST /invoke {prompt, sessionId?} → {output, sessionId}
GET  /healthz                     → {ok: true}

Register in the agentxray console as an external agent:
  service name : agentxray-demo-agent
  log group    : /aws/bedrock-agentcore/runtimes/agentxray-demo-agent
  invoke URL   : http://127.0.0.1:9100/invoke   (session header X-Session-Id)
"""

from __future__ import annotations

import os
import uuid

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from . import agent, tracing

app = FastAPI(title="agentxray demo external agent")


class InvokeRequest(BaseModel):
    prompt: str
    sessionId: str | None = None


class InvokeResponse(BaseModel):
    output: str
    sessionId: str


@app.get("/healthz")
def healthz() -> dict[str, bool]:
    return {"ok": True}


@app.post("/invoke", response_model=InvokeResponse)
async def invoke(req: InvokeRequest) -> InvokeResponse:
    session_id = req.sessionId or str(uuid.uuid4())
    model = os.environ.get("ANTHROPIC_MODEL", "claude")
    with tracing.traced_invocation(session_id, req.prompt) as span:
        try:
            result = await agent.run_agent(req.prompt)
        except Exception as exc:
            span.record_exception(exc)
            raise HTTPException(
                status_code=502, detail=f"{type(exc).__name__}: {exc}"
            ) from exc
        # One execute_tool span (child of invoke_agent) per tool call — the
        # tool-level evaluators (ToolSelectionAccuracy etc.) read these.
        for call in result.tool_calls:
            spec = agent.TOOL_SPECS.get(call.name, {})
            tracing.record_tool_call(
                session_id=session_id,
                call_id=call.call_id,
                name=call.name,
                description=spec.get("description", ""),
                json_schema=spec.get("schema", {}),
                arguments=call.input,
                result_text=call.result_text,
                is_error=call.is_error,
            )
        tracing.record_result(
            span,
            session_id=session_id,
            system_prompt=agent.SYSTEM_PROMPT,
            prompt=req.prompt,
            output=result.output,
            model=model,
        )
    return InvokeResponse(output=result.output, sessionId=session_id)
