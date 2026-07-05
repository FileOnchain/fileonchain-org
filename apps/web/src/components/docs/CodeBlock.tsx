import * as React from "react";
import { cn } from "@/lib/cn";
import CopyButton from "@/components/ui/CopyButton";

interface CodeBlockProps {
  code: string;
  /** Short label shown in the block's title bar, e.g. "terminal" or "anchor.ts". */
  title?: string;
  className?: string;
}

/**
 * CodeBlock — static code sample for the docs page. Server component (the
 * embedded CopyButton is the only client island) so snippets ship as plain
 * HTML and stay indexable.
 */
export const CodeBlock = ({ code, title, className }: CodeBlockProps) => (
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
    <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-foreground">
      <code className="font-mono">{code}</code>
    </pre>
  </figure>
);

export default CodeBlock;
