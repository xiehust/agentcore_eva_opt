import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLang } from "../i18n/lang";
import type { StepLearn } from "../i18n/messages";

/**
 * Shared step header used by every step component: a numbered eyebrow, a
 * display title, a lede paragraph, and (when provided) an expandable
 * teaching block — purpose, key concepts, takeaway. The sim exists to teach
 * the workflow; this is where each step explains WHY it exists.
 */
export function StepHeader({
  index,
  title,
  lede,
  learn,
}: {
  index: number;
  title: string;
  lede: ReactNode;
  learn?: StepLearn;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
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
      {learn && (
        <div className="mt-4 max-w-2xl">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            data-testid="learn-toggle"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-soft transition-colors hover:text-cyan"
          >
            <span aria-hidden className="inline-block transition-transform" style={{ transform: open ? "rotate(90deg)" : "none" }}>
              ▸
            </span>
            {open ? t.learnMore.hide : t.learnMore.show}
          </button>
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
                data-testid="learn-panel"
              >
                <div className="mt-3 space-y-4 rounded-md border border-cyan/20 bg-cyan/[0.04] px-4 py-4">
                  <div>
                    <span className="eyebrow mb-1.5 block text-cyan-soft/80">{t.learnMore.purpose}</span>
                    <p className="text-[13px] leading-relaxed text-fog-300">{learn.purpose}</p>
                  </div>
                  <div>
                    <span className="eyebrow mb-2 block text-cyan-soft/80">{t.learnMore.concepts}</span>
                    <dl className="space-y-2.5">
                      {learn.points.map(([term, explanation]) => (
                        <div key={term}>
                          <dt className="text-[13px] font-semibold text-fog-100">{term}</dt>
                          <dd className="mt-0.5 text-[13px] leading-relaxed text-fog-400">{explanation}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                  <div className="border-t border-line/60 pt-3">
                    <span className="eyebrow mb-1.5 block text-aws-orange/90">{t.learnMore.takeaway}</span>
                    <p className="text-[13px] leading-relaxed text-fog-200">{learn.takeaway}</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
