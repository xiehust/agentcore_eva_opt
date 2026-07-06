import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useLang } from "../i18n/lang";

/**
 * Password gate for internet-facing deployments. On mount it asks the backend
 * whether auth is required; if not (local dev, no LAB4_AUTH_PASSWORD), it
 * renders children immediately. The session lives in an HttpOnly cookie set
 * by POST /api/auth/login — nothing is stored in the browser.
 */
export function LoginGate({ children }: { children: ReactNode }) {
  const { t } = useLang();
  // undefined = probing; true = show login; false = through.
  const [locked, setLocked] = useState<boolean | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((s: { authRequired?: boolean; authenticated?: boolean }) => {
        // Boolean(): a malformed/unexpected body must not strand the probe.
        setLocked(Boolean(s.authRequired) && !s.authenticated);
      })
      .catch(() => {
        // Backend unreachable — don't dead-end the sim experience.
        setLocked(false);
      });
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const resp = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (resp.ok) {
        setLocked(false);
      } else {
        setError(t.auth.wrongPassword);
      }
    } catch {
      setError(t.auth.unreachable);
    } finally {
      setBusy(false);
    }
  };

  if (locked === undefined) return null; // brief probe; avoids a login flash
  if (!locked) return <>{children}</>;

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-lg border border-line bg-ink-850/90 p-6 shadow-xl"
      >
        <div className="mb-5 flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded bg-aws-orange font-display text-sm font-black text-ink-900">
            A
          </span>
          <span className="font-display text-sm font-bold text-fog-100">
            {t.auth.title}
          </span>
        </div>
        <label className="block">
          <span className="eyebrow mb-1 block">{t.auth.passwordLabel}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            autoComplete="current-password"
            className="w-full rounded-md border border-line bg-ink-900/60 px-3 py-2 text-sm text-fog-100 outline-none focus:border-aws-orange/60"
          />
        </label>
        {error && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || password.length === 0}
          className="mt-4 w-full rounded-md bg-aws-orange px-4 py-2 text-sm font-semibold text-ink-900 transition-opacity disabled:opacity-50"
        >
          {busy ? t.auth.signingIn : t.auth.signIn}
        </button>
        <p className="mt-3 text-[11px] leading-relaxed text-fog-500">
          {t.auth.hint}
        </p>
      </form>
    </div>
  );
}
