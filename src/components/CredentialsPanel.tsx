import { useState } from "react";
import { Card, Button, Badge } from "./ui";
import { useJourney } from "../state/journey";
import { makeLiveApi } from "../lib/liveApi";
import { cn } from "../lib/cn";
import { useLang } from "../i18n/lang";

type TestState = "idle" | "testing" | "ok" | "error";

/**
 * Live-mode credentials + region form. The default path uses the backend's
 * EC2 IAM role (no input needed). Optional AK/SK are held only in in-memory
 * journey state for the session — never written to localStorage.
 */
export function CredentialsPanel() {
  const { state, dispatch } = useJourney();
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [useManual, setUseManual] = useState(
    !!state.liveCreds.accessKeyId,
  );
  const [form, setForm] = useState(state.liveCreds);
  const [testState, setTestState] = useState<TestState>("idle");
  const [testMsg, setTestMsg] = useState<string>("");

  if (state.mode !== "live") return null;

  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const test = async () => {
    setTestState("testing");
    setTestMsg("");
    const creds = useManual ? form : { region: form.region };
    dispatch({ type: "SET_CREDS", creds });
    try {
      const api = makeLiveApi(state.apiBase);
      const r = await api.identity(creds);
      if (r.ok && r.account) {
        setTestState("ok");
        setTestMsg(`${r.account} · ${r.region}`);
        dispatch({
          type: "SET_IDENTITY",
          identity: { account: r.account, arn: r.arn ?? "", region: r.region ?? "" },
        });
      } else {
        setTestState("error");
        setTestMsg(r.error ?? t.creds.identityFailed);
        dispatch({ type: "SET_IDENTITY", identity: undefined });
      }
    } catch (e) {
      setTestState("error");
      setTestMsg(
        e instanceof Error
          ? `${t.creds.cannotReach}: ${e.message}`
          : t.creds.cannotReach,
      );
      dispatch({ type: "SET_IDENTITY", identity: undefined });
    }
  };

  return (
    <Card
      eyebrow={t.creds.eyebrow}
      title={t.creds.title}
      accent="orange"
      className="mb-6"
      action={
        state.liveIdentity ? (
          <Badge variant="ok" dot mono>
            {state.liveIdentity.account}
          </Badge>
        ) : (
          <Badge variant="neutral" mono>
            {t.creds.notConnected}
          </Badge>
        )
      }
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mb-3 font-mono text-xs text-cyan-soft hover:underline"
      >
        {open ? t.creds.hide : t.creds.configure}
      </button>

      {open && (
        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="sr-only">Credential source</legend>
            <label className="flex items-center gap-2 text-sm text-fog-300">
              <input
                type="radio"
                name="credsource"
                checked={!useManual}
                onChange={() => setUseManual(false)}
              />
              {t.creds.useRole}
            </label>
            <label className="flex items-center gap-2 text-sm text-fog-300">
              <input
                type="radio"
                name="credsource"
                checked={useManual}
                onChange={() => setUseManual(true)}
              />
              {t.creds.useKeys}
            </label>
          </fieldset>

          {useManual && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={t.creds.accessKeyId}
                value={form.accessKeyId ?? ""}
                onChange={(v) => set("accessKeyId", v)}
              />
              <Field
                label={t.creds.secretAccessKey}
                type="password"
                value={form.secretAccessKey ?? ""}
                onChange={(v) => set("secretAccessKey", v)}
              />
              <Field
                label={t.creds.sessionToken}
                type="password"
                value={form.sessionToken ?? ""}
                onChange={(v) => set("sessionToken", v)}
              />
              <Field
                label={t.creds.region}
                placeholder="us-west-2"
                value={form.region ?? ""}
                onChange={(v) => set("region", v)}
              />
            </div>
          )}

          {!useManual && (
            <Field
              label={t.creds.regionOptional}
              placeholder="us-west-2"
              value={form.region ?? ""}
              onChange={(v) => set("region", v)}
            />
          )}

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              onClick={test}
              disabled={testState === "testing"}
            >
              {testState === "testing" ? t.creds.testing : t.creds.test}
            </Button>
            {testState === "ok" && (
              <span className="font-mono text-xs text-ok">✓ {testMsg}</span>
            )}
            {testState === "error" && (
              <span className="font-mono text-xs text-danger">✗ {testMsg}</span>
            )}
          </div>

          <p className="text-xs text-fog-600">{t.creds.neverStored}</p>
        </div>
      )}
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="eyebrow mb-1 block">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full rounded-md border border-line-bright bg-ink-900/60 px-3 py-1.5",
          "font-mono text-sm text-fog-100 placeholder:text-fog-600",
          "focus:border-aws-orange focus:outline-none",
        )}
        autoComplete="off"
        spellCheck={false}
      />
    </label>
  );
}
