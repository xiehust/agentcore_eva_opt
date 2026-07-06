import { useMemo, useState } from "react";
import { cn } from "../../lib/cn";
import { highlight, TOKEN_CLASS } from "../../lib/highlight";

interface CodeBlockProps {
  code: string;
  /** Language label shown in the header (e.g. "python"). */
  language?: string;
  /** Optional caption describing what the snippet maps to. */
  caption?: string;
  className?: string;
}

/**
 * Read-only, monospaced code panel with a language label header and copy
 * button. Used to show the boto3 API call behind each simulated step.
 */
export function CodeBlock({
  code,
  language = "python",
  caption,
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const tokens = useMemo(() => highlight(code, language), [code, language]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard may be unavailable (e.g. insecure context) — fail silently.
    }
  };

  return (
    <figure
      className={cn(
        "overflow-hidden rounded-md border border-line bg-ink-900/80",
        className,
      )}
    >
      <figcaption className="flex items-center justify-between border-b border-line/70 bg-ink-800/60 px-3 py-1.5">
        <span className="flex items-center gap-2">
          <span className="flex gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-warn/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-ok/70" />
          </span>
          <span className="font-mono text-[0.6875rem] uppercase tracking-widest text-fog-500">
            {language}
          </span>
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="font-mono text-[0.6875rem] uppercase tracking-widest text-fog-500 transition-colors hover:text-cyan-soft"
        >
          {copied ? "copied ✓" : "copy"}
        </button>
      </figcaption>
      <pre className="overflow-x-auto px-4 py-3.5 text-[0.8125rem] leading-relaxed">
        <code className="font-mono text-fog-300">
          {tokens.map((t, idx) => (
            <span key={idx} className={TOKEN_CLASS[t.type]}>
              {t.value}
            </span>
          ))}
        </code>
      </pre>
      {caption && (
        <p className="border-t border-line/60 px-4 py-2 text-xs text-fog-500">
          {caption}
        </p>
      )}
    </figure>
  );
}
