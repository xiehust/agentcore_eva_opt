/**
 * Language context + hook (no components here, so react-refresh stays happy).
 * Default is Chinese; the choice persists in localStorage (`lab4.lang`).
 */
import { createContext, useContext } from "react";
import { MESSAGES, type Lang, type Messages } from "./messages";

export const LANG_KEY = "lab4.lang";

export function getInitialLang(): Lang {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === "en" || stored === "zh") return stored;
  } catch {
    /* localStorage unavailable (SSR / private mode) */
  }
  return "zh"; // default: Chinese
}

export interface LangContextValue {
  lang: Lang;
  t: Messages;
  setLang: (lang: Lang) => void;
}

export const LangContext = createContext<LangContextValue | null>(null);

/**
 * Active language + message catalog. Outside a LangProvider (e.g. components
 * rendered directly in tests) it falls back to the initial language with a
 * no-op setter, so components never crash for lack of a provider.
 */
export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (ctx) return ctx;
  const lang = getInitialLang();
  return { lang, t: MESSAGES[lang], setLang: () => {} };
}
