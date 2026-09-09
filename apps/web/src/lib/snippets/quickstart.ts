import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { highlightCode } from "@/lib/highlight";
import type { QuickstartTab } from "@/lib/snippets/types";
import { CLI_QUICKSTART_SNIPPET } from "@/lib/snippets/cli";
import { MCP_QUICKSTART_SNIPPET } from "@/lib/snippets/mcp";

export type { QuickstartTab, QuickstartTabId } from "@/lib/snippets/types";

const SDK_EXAMPLE_PATH = path.join(
  process.cwd(),
  "src",
  "lib",
  "snippets",
  "sdk-quickstart.example.ts",
);

const SNIPPET_MARKER = "// ---- snippet:start ----";

/**
 * Cut the displayed part out of the example file's source: everything after
 * the marker line, so the type-checking preamble stays out of the snippet.
 */
export const extractSnippet = (source: string): string => {
  const index = source.indexOf(SNIPPET_MARKER);
  if (index === -1) {
    throw new Error(`sdk-quickstart.example.ts is missing the "${SNIPPET_MARKER}" marker`);
  }
  return source.slice(index + SNIPPET_MARKER.length).trim();
};

/**
 * The three quickstart tabs, highlighted on the server. The SDK tab is read
 * from `sdk-quickstart.example.ts`, a file `next build` type-checks against
 * the current SDK, so the snippet cannot rot silently. The homepage is
 * statically rendered, so the read happens at build time.
 */
export const getDeveloperQuickstartTabs = async (): Promise<QuickstartTab[]> => {
  const sdkCode = extractSnippet(await readFile(SDK_EXAMPLE_PATH, "utf8"));
  const sources: Array<Omit<QuickstartTab, "html">> = [
    { id: "sdk", label: "SDK", title: "seal.ts", language: "ts", code: sdkCode },
    { id: "cli", label: "CLI", title: "terminal", language: "sh", code: CLI_QUICKSTART_SNIPPET },
    { id: "mcp", label: "MCP", title: "terminal", language: "sh", code: MCP_QUICKSTART_SNIPPET },
  ];
  return Promise.all(
    sources.map(async (tab) => ({ ...tab, html: await highlightCode(tab.code, tab.language) })),
  );
};
