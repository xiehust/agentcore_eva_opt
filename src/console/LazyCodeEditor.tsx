import { lazy, Suspense } from "react";
import { useLang } from "../i18n/lang";

// CodeMirror 6 is heavy; load it only when an agent editor is actually open,
// keeping it out of the initial (and Sim-mode) bundle — same pattern as
// LazyABChart.
const CodeEditorImpl = lazy(() =>
  import("./CodeEditorImpl").then((m) => ({ default: m.CodeEditorImpl })),
);

interface Props {
  value: string;
  onChange: (value: string) => void;
}

/** Suspense wrapper around the CodeMirror-based Python editor. */
export function LazyCodeEditor(props: Props) {
  const { t } = useLang();
  return (
    <Suspense
      fallback={
        <div className="flex h-72 items-center justify-center rounded-md border border-line bg-ink-900/40">
          <span className="font-mono text-xs text-fog-500">
            {t.console.agents.editorLoading}
          </span>
        </div>
      }
    >
      <CodeEditorImpl {...props} />
    </Suspense>
  );
}
