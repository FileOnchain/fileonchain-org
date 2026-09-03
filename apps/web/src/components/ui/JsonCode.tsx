import * as React from "react";
import { cn } from "@/lib/cn";

/* Strings (a trailing colon marks an object key), true/false/null, numbers.
 * Everything unmatched (punctuation, whitespace) renders unstyled. */
const JSON_TOKEN =
  /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g;

interface JsonCodeProps {
  code: string;
  className?: string;
}

/**
 * JsonCode — lightweight syntax highlighting for runtime JSON (decoded
 * anchor payloads, upload previews). A tiny tokenizer instead of a real
 * highlighter: these blocks live inside client components, where shipping
 * Shiki's grammars to the browser isn't worth it. Colors come from the
 * `--code-*` design tokens, which follow the light/dark theme. Tolerates
 * truncated/invalid JSON — unmatched text simply renders unstyled.
 */
const JsonCode = ({ code, className }: JsonCodeProps) => {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of code.matchAll(JSON_TOKEN)) {
    const index = match.index ?? 0;
    const [full, string, colon, literal] = match;
    if (index > last) parts.push(code.slice(last, index));
    if (string !== undefined) {
      parts.push(
        <span key={index} className={colon ? "text-code-key" : "text-code-string"}>
          {string}
        </span>,
      );
      if (colon) parts.push(colon);
    } else if (literal !== undefined) {
      parts.push(
        <span key={index} className="text-code-literal">
          {full}
        </span>,
      );
    } else {
      parts.push(
        <span key={index} className="text-code-number">
          {full}
        </span>,
      );
    }
    last = index + full.length;
  }
  if (last < code.length) parts.push(code.slice(last));
  return <pre className={cn(className)}>{parts}</pre>;
};

export default JsonCode;
