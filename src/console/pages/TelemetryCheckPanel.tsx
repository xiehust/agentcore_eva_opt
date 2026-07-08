import { useState } from "react";
import { Badge, Button } from "../../components/ui";
import { useLiveApi } from "../../lib/useLiveApi";
import { useLang } from "../../i18n/lang";
import type { TelemetryCheckResult } from "../../lib/liveApi";

const LOOKBACKS = [1, 24, 168] as const;

/** One-click CloudWatch probe: do this agent's spans actually land (with
 * session.id)? Renders ✓/✗ per check + backend hints on failure. */
export function TelemetryCheckPanel({ agentId }: { agentId: string }) {
  const { api, creds } = useLiveApi();
  const { t } = useLang();
  const msgs = t.console.agents.telemetry;
  const [lookback, setLookback] = useState<number>(24);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TelemetryCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { jobId } = await api.telemetryCheck(agentId, {
        lookbackHours: lookback,
        creds: creds ?? null,
      });
      setResult(await api.pollJob<TelemetryCheckResult>(jobId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void check()} data-testid="telemetry-check">
          {busy ? msgs.checking : msgs.checkBtn}
        </Button>
        <span className="text-[11px] text-fog-500">{msgs.lookback}:</span>
        {LOOKBACKS.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => setLookback(h)}
            className={`rounded border px-1.5 py-0.5 font-mono text-[11px] ${
              lookback === h
                ? "border-cyan/60 bg-cyan/10 text-cyan-soft"
                : "border-line text-fog-400 hover:border-cyan/40"
            }`}
          >
            {h}h
          </button>
        ))}
      </div>
      {error && (
        <div role="alert" className="mt-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}
      {result && <TelemetryResult result={result} />}
    </div>
  );
}

function CheckRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-center gap-2 text-xs" data-testid={`telemetry-row-${ok ? "ok" : "fail"}`}>
      <span aria-hidden className={ok ? "text-ok" : "text-danger"}>{ok ? "✓" : "✗"}</span>
      <span className="text-fog-300">{label}</span>
      <span className={`ml-auto font-mono text-[11px] ${ok ? "text-fog-500" : "text-danger"}`}>{detail}</span>
    </div>
  );
}

function TelemetryResult({ result }: { result: TelemetryCheckResult }) {
  const { t } = useLang();
  const msgs = t.console.agents.telemetry;
  const spans = result.spans;
  return (
    <div
      className={`mt-2 space-y-1.5 rounded-md border px-3 py-2.5 ${
        result.ok ? "border-ok/40 bg-ok/5" : spans.spanCount > 0 ? "border-warn/40 bg-warn/5" : "border-danger/40 bg-danger/5"
      }`}
      data-testid="telemetry-result"
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="eyebrow">{msgs.eyebrow}</span>
        <Badge variant={result.ok ? "ok" : spans.spanCount > 0 ? "warn" : "danger"} dot mono>
          {result.serviceName}
        </Badge>
        {spans.lastSpanAt != null && (
          <span className="ml-auto font-mono text-[11px] text-fog-500">
            {msgs.lastSpanAt}: {new Date(spans.lastSpanAt > 1e15 ? spans.lastSpanAt / 1e6 : spans.lastSpanAt).toLocaleString()}
          </span>
        )}
      </div>
      <CheckRow ok={result.logGroup.exists} label={msgs.logGroupCheck} detail={result.logGroup.name} />
      <CheckRow
        ok={spans.spanCount > 0}
        label={msgs.spansCheck}
        detail={spans.spanCount > 0 ? msgs.spansFound(spans.spanCount) : msgs.noSpans}
      />
      <CheckRow
        ok={spans.sessionIdPresent}
        label={msgs.sessionIdCheck}
        detail={spans.sessionIdPresent ? spans.sessionIdSamples.join(", ") : msgs.sessionIdMissing}
      />
      {spans.operationNames.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="text-[11px] text-fog-500">{msgs.operations}:</span>
          {spans.operationNames.map((op) => (
            <Badge key={op} variant="neutral" mono>{op}</Badge>
          ))}
        </div>
      )}
      {result.ok && <p className="pt-0.5 text-[11px] text-ok">{msgs.allGood}</p>}
      {result.hints.length > 0 && (
        <div className="pt-1">
          <span className="eyebrow mb-1 block">{msgs.hintsEyebrow}</span>
          <ul className="space-y-1">
            {result.hints.map((h, i) => (
              <li key={i} className="font-mono text-[11px] leading-relaxed text-fog-400">
                {h}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Copyable agent-side OTEL setup, generated from the registered binding. */
export function OtelSnippet({ serviceName, logGroup }: { serviceName: string; logGroup: string }) {
  const { t } = useLang();
  const msgs = t.console.agents.telemetry;
  const [copied, setCopied] = useState(false);
  const svc = serviceName || "<service-name>";
  const lg = logGroup || "<log-group>";
  const snippet = `AGENT_OBSERVABILITY_ENABLED=true
OTEL_PYTHON_DISTRO=aws_distro
OTEL_PYTHON_CONFIGURATOR=aws_configurator
OTEL_RESOURCE_ATTRIBUTES=service.name=${svc},aws.log.group.names=${lg}
OTEL_EXPORTER_OTLP_LOGS_HEADERS=x-aws-log-group=${lg},x-aws-log-stream=runtime-logs,x-aws-metric-namespace=bedrock-agentcore
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_TRACES_EXPORTER=otlp

# Session ID propagation (python):
from opentelemetry import baggage
from opentelemetry.context import attach

ctx = baggage.set_baggage("session.id", session_id)
attach(ctx)`;

  const copy = () => {
    void navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="rounded-md border border-line bg-ink-900/40 px-4 py-3">
      <div className="mb-1.5 flex items-center">
        <span className="eyebrow">{msgs.snippetEyebrow}</span>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={copy} data-testid="otel-snippet-copy">
          {copied ? msgs.copied : msgs.copy}
        </Button>
      </div>
      <p className="mb-2 text-[11px] leading-relaxed text-fog-500">{msgs.snippetHint}</p>
      <pre className="overflow-x-auto whitespace-pre font-mono text-[11px] leading-relaxed text-fog-300" data-testid="otel-snippet">
        {snippet}
      </pre>
    </div>
  );
}
