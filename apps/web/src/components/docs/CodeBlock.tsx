import * as React from "react";
import { cn } from "@/lib/cn";
import { highlightCode, type CodeLanguage } from "@/lib/highlight";
import CopyButton from "@/components/ui/CopyButton";

interface CodeBlockProps {
  code: string;
  /** Shiki language id. TypeScript is the house default for SDK snippets. */
  language?: CodeLanguage;
  /** Short label shown in the block's title bar, e.g. "terminal" or "anchor.ts". */
  title?: string;
  className?: string;
}

/**
 * CodeBlock — static code sample with server-side syntax highlighting.
 * Async server component (the embedded CopyButton is the only client island):
 * Shiki runs at render time, so snippets ship as pre-colored, indexable HTML
 * that follows the light/dark theme purely via CSS variables.
 */
export const CodeBlock = async ({
  code,
  language = "ts",
  title,
  className,
}: CodeBlockProps) => {
  const highlighted = await highlightCode(code, language);
  return (
    <figure
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-surface",
        className,
      )}
    >
      <figcaption className="flex items-center justify-between gap-2 border-b border-border bg-surface-elevated/60 px-3 py-1.5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
          {title ?? "code"}
        </span>
        <CopyButton value={code} ariaLabel={`Copy ${title ?? "code"} snippet`} />
      </figcaption>
      {/* Shiki output: a <pre><code> tree of colored spans — trusted, locally
          generated from the string literal above. */}
      <div dangerouslySetInnerHTML={{ __html: highlighted }} />
    </figure>
  );
};

export default CodeBlock;
