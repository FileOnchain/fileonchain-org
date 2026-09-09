import type { CodeLanguage } from "@/lib/highlight";

export type QuickstartTabId = "sdk" | "cli" | "mcp";

/** One tab of the homepage developer quickstart, highlighted on the server. */
export interface QuickstartTab {
  id: QuickstartTabId;
  /** Tab trigger label. */
  label: string;
  /** Title-bar caption, e.g. a file name or "terminal". */
  title: string;
  language: CodeLanguage;
  /** Raw snippet, what the copy button puts on the clipboard. */
  code: string;
  /** Shiki output for `code`, theme-agnostic HTML. */
  html: string;
}
