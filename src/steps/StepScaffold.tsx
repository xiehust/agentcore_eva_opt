import type { ReactNode } from "react";
import { useLang } from "../i18n/lang";

/**
 * Shared step header used by every step component: a numbered eyebrow, a
 * display title, and a lede paragraph. Keeps the 9 steps visually consistent.
 */
export function StepHeader({
  index,
  title,
  lede,
}: {
  index: number;
  title: string;
  lede: ReactNode;
}) {
  const { t } = useLang();
  return (
    <div className="mb-7">
      <div className="eyebrow mb-2 flex items-center gap-3">
        <span className="text-aws-orange">{t.stepLabel(index)}</span>
        <span className="inline-block h-px w-8 bg-line-bright" />
        {t.shell.appTitle}
      </div>
      <h2 className="font-display text-2xl font-bold leading-tight text-fog-100 sm:text-3xl">
        {title}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fog-300 sm:text-base">
        {lede}
      </p>
    </div>
  );
}
