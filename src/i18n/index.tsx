/**
 * Lightweight i18n: LangProvider carries the active language + message
 * catalog; LangToggle is the 中文 ⇄ EN header control. Hook + helpers live in
 * ./lang, the typed catalogs in ./messages (missing keys fail to compile).
 */
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { MESSAGES, type Lang } from "./messages";
import { LangContext, LANG_KEY, getInitialLang, useLang } from "./lang";

export type { Lang, Messages } from "./messages";

export function LangProvider({
  children,
  initialLang,
}: {
  children: ReactNode;
  /** Override for tests; defaults to localStorage/zh. */
  initialLang?: Lang;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang ?? getInitialLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      /* non-persistent environment */
    }
  }, []);

  const value = useMemo(
    () => ({ lang, t: MESSAGES[lang], setLang }),
    [lang, setLang],
  );
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

/** 中文 ⇄ EN segmented toggle for headers. */
export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <div
      role="group"
      aria-label="Language"
      className="inline-flex items-center rounded-md border border-line-bright bg-ink-800/80 p-0.5"
    >
      {(["zh", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
          className={
            "rounded px-2.5 py-1 font-mono text-xs tracking-wider transition-colors " +
            (lang === l
              ? "bg-ink-700 text-fog-100"
              : "text-fog-500 hover:text-fog-300")
          }
        >
          {l === "zh" ? "中文" : "EN"}
        </button>
      ))}
    </div>
  );
}
