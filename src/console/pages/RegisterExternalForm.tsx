import { useState } from "react";
import { Button, Card } from "../../components/ui";
import { useLiveApi } from "../../lib/useLiveApi";
import { useLang } from "../../i18n/lang";
import type { AgentRecord } from "../../lib/liveApi";
import { OtelSnippet } from "./TelemetryCheckPanel";

/** Register (or edit) an EXTERNAL agent by its telemetry binding —
 * no code, no deploy: evaluation reads the agent's existing OTEL traces. */
const DEFAULT_PAYLOAD_TEMPLATE = '{"prompt": {prompt}, "sessionId": {sessionId}}';

export function RegisterExternalForm({
  agent,
  onDone,
  onCancel,
}: {
  /** When present, edits this external agent instead of creating one. */
  agent?: AgentRecord;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { api } = useLiveApi();
  const { t } = useLang();
  const existingInvoke = agent?.binding?.invoke ?? null;
  const [name, setName] = useState(agent?.name ?? "");
  const [description, setDescription] = useState(agent?.description ?? "");
  const [serviceName, setServiceName] = useState(agent?.binding?.serviceName ?? "");
  const [logGroup, setLogGroup] = useState(agent?.binding?.logGroup ?? "");
  const [region, setRegion] = useState(agent?.binding?.region ?? "");
  // Invocation endpoint (optional) — collapsed unless already configured.
  const [invokeOpen, setInvokeOpen] = useState(Boolean(existingInvoke));
  const [invokeUrl, setInvokeUrl] = useState(existingInvoke?.url ?? "");
  const [payloadTemplate, setPayloadTemplate] = useState(
    existingInvoke?.payloadTemplate ?? DEFAULT_PAYLOAD_TEMPLATE,
  );
  const [sessionHeader, setSessionHeader] = useState(existingInvoke?.sessionHeader ?? "X-Session-Id");
  const [timeoutSeconds, setTimeoutSeconds] = useState(existingInvoke?.timeoutSeconds ?? 60);
  const [headerRows, setHeaderRows] = useState<{ name: string; value: string }[]>(
    Object.entries(existingInvoke?.headers ?? {}).map(([name, value]) => ({ name, value })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputCls =
    "w-full rounded-md border border-line bg-ink-900/60 px-3 py-2 text-sm text-fog-100 outline-none focus:border-cyan/60";

  const submit = async () => {
    if (!name.trim()) return setError(t.console.agents.nameRequired);
    if (!serviceName.trim() || !logGroup.trim())
      return setError(t.console.agents.bindingRequired);
    const url = invokeUrl.trim();
    if (invokeOpen && url && !/^https?:\/\//.test(url))
      return setError(t.console.agents.invoke.urlInvalid);
    setBusy(true);
    setError(null);
    const invoke =
      invokeOpen && url
        ? {
            url,
            payloadTemplate,
            sessionHeader: sessionHeader.trim() || "X-Session-Id",
            headers: Object.fromEntries(
              headerRows.filter((h) => h.name.trim()).map((h) => [h.name.trim(), h.value]),
            ),
            timeoutSeconds,
          }
        : null;
    const binding = {
      serviceName: serviceName.trim(),
      logGroup: logGroup.trim(),
      region: region?.trim() || null,
      invoke,
    };
    try {
      if (agent) {
        await api.updateAgent(agent.id, { name: name.trim(), description, binding });
      } else {
        await api.createAgent({
          name: name.trim(),
          description,
          kind: "external",
          binding,
        });
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Card eyebrow={t.console.agents.externalEyebrow} title={t.console.agents.externalTitle} accent="cyan">
      <p className="mb-4 text-xs leading-relaxed text-fog-400">{t.console.agents.externalHint}</p>
      {error && (
        <div role="alert" className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="eyebrow mb-1 block">{t.console.common.name}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} data-testid="ext-name" />
          </label>
          <label className="block">
            <span className="eyebrow mb-1 block">{t.console.common.description}</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="eyebrow mb-1 block">{t.console.agents.bindingServiceName}</span>
            <input
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              placeholder="my-agent"
              className={`${inputCls} font-mono`}
              data-testid="ext-service-name"
            />
            <span className="mt-1 block text-[11px] text-fog-500">{t.console.agents.bindingServiceNameHint}</span>
          </label>
          <label className="block">
            <span className="eyebrow mb-1 block">{t.console.agents.bindingLogGroup}</span>
            <input
              value={logGroup}
              onChange={(e) => setLogGroup(e.target.value)}
              placeholder="/aws/bedrock-agentcore/runtimes/my-agent"
              className={`${inputCls} font-mono`}
              data-testid="ext-log-group"
            />
            <span className="mt-1 block text-[11px] text-fog-500">{t.console.agents.bindingLogGroupHint}</span>
          </label>
        </div>
        <label className="block sm:w-1/2">
          <span className="eyebrow mb-1 block">{t.console.agents.bindingRegion}</span>
          <input
            value={region ?? ""}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="us-west-2"
            className={`${inputCls} font-mono`}
          />
        </label>

        <div className="rounded-md border border-line bg-ink-900/30 px-4 py-3">
          <button
            type="button"
            onClick={() => setInvokeOpen((v) => !v)}
            className="flex w-full items-center text-left"
            data-testid="invoke-toggle"
            aria-expanded={invokeOpen}
          >
            <span className="eyebrow">{t.console.agents.invoke.sectionTitle}</span>
            <span aria-hidden className="ml-auto text-fog-500">{invokeOpen ? "▾" : "▸"}</span>
          </button>
          {invokeOpen && (
            <div className="mt-3 space-y-3">
              <p className="text-[11px] leading-relaxed text-fog-500">{t.console.agents.invoke.sectionHint}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="eyebrow mb-1 block">{t.console.agents.invoke.url}</span>
                  <input
                    value={invokeUrl}
                    onChange={(e) => setInvokeUrl(e.target.value)}
                    placeholder="http://127.0.0.1:9100/invoke"
                    className={`${inputCls} font-mono`}
                    data-testid="invoke-url"
                  />
                </label>
                <label className="block">
                  <span className="eyebrow mb-1 block">{t.console.agents.invoke.sessionHeader}</span>
                  <input
                    value={sessionHeader}
                    onChange={(e) => setSessionHeader(e.target.value)}
                    className={`${inputCls} font-mono`}
                    data-testid="invoke-session-header"
                  />
                </label>
              </div>
              <label className="block">
                <span className="eyebrow mb-1 block">{t.console.agents.invoke.payloadTemplate}</span>
                <textarea
                  value={payloadTemplate}
                  onChange={(e) => setPayloadTemplate(e.target.value)}
                  rows={2}
                  spellCheck={false}
                  className={`${inputCls} font-mono text-xs`}
                  data-testid="invoke-payload"
                />
                <span className="mt-1 block text-[11px] text-fog-500">
                  {t.console.agents.invoke.payloadTemplateHint}
                </span>
              </label>
              <div>
                <span className="eyebrow mb-1 block">{t.console.agents.invoke.headers}</span>
                <div className="space-y-2">
                  {headerRows.map((row, i) => (
                    <div key={i} className="grid gap-2 sm:grid-cols-[200px_minmax(0,1fr)_auto]">
                      <input
                        value={row.name}
                        placeholder={t.console.agents.invoke.headerName}
                        onChange={(e) =>
                          setHeaderRows(headerRows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))
                        }
                        className={`${inputCls} font-mono text-xs`}
                        data-testid={`invoke-header-name-${i}`}
                      />
                      <input
                        value={row.value}
                        placeholder={t.console.agents.invoke.headerValue}
                        onChange={(e) =>
                          setHeaderRows(headerRows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))
                        }
                        className={`${inputCls} font-mono text-xs`}
                        data-testid={`invoke-header-value-${i}`}
                      />
                      <Button size="sm" variant="ghost" onClick={() => setHeaderRows(headerRows.filter((_, j) => j !== i))}>
                        {t.console.agents.invoke.removeHeader}
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-2"
                  onClick={() => setHeaderRows([...headerRows, { name: "", value: "" }])}
                  data-testid="invoke-add-header"
                >
                  {t.console.agents.invoke.addHeader}
                </Button>
              </div>
              <label className="block sm:w-1/3">
                <span className="eyebrow mb-1 block">{t.console.agents.invoke.timeout}</span>
                <input
                  type="number"
                  min={1}
                  value={timeoutSeconds}
                  onChange={(e) => setTimeoutSeconds(Number(e.target.value) || 60)}
                  className={inputCls}
                />
              </label>
              <p className="text-[11px] leading-relaxed text-warn/80">{t.console.agents.invoke.privacyNote}</p>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => void submit()} data-testid="ext-register">
            {agent ? t.console.common.save : t.console.agents.registerBtn}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
            {t.console.common.cancel}
          </Button>
        </div>

        <OtelSnippet serviceName={serviceName.trim()} logGroup={logGroup.trim()} />
      </div>
    </Card>
  );
}
