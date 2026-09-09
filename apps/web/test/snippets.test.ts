import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractSnippet } from "@/lib/snippets/quickstart";
import { CLI_QUICKSTART_SNIPPET } from "@/lib/snippets/cli";
import { MCP_CLAUDE_CODE_SNIPPET, MCP_CONFIG_SNIPPET, MCP_QUICKSTART_SNIPPET } from "@/lib/snippets/mcp";

/**
 * The homepage quickstart snippets. `next build` type-checks the SDK example
 * file; these tests pin the shape of what the homepage extracts from it and
 * keep the CLI and MCP snippets honest about names that exist.
 */
const examplePath = path.resolve(__dirname, "../src/lib/snippets/sdk-quickstart.example.ts");

describe("developer quickstart snippets", () => {
  it("extracts only the part of the SDK example below the marker", () => {
    const snippet = extractSnippet(readFileSync(examplePath, "utf8"));
    expect(snippet.startsWith("import ")).toBe(true);
    expect(snippet).toContain('from "@fileonchain/sdk/evidence"');
    expect(snippet).toContain("sealAgentRun(");
    // The type-checking preamble never reaches the page.
    expect(snippet).not.toContain("declare const");
    expect(snippet).not.toContain("snippet:start");
    // Above the fold: keep it short.
    expect(snippet.split("\n").length).toBeLessThanOrEqual(14);
  });

  it("throws when the marker is missing", () => {
    expect(() => extractSnippet("const x = 1;")).toThrow(/marker/);
  });

  it("uses the published verify bin and the verifier's own status words", () => {
    expect(CLI_QUICKSTART_SNIPPET).toContain("npx -p @fileonchain/verify fileonchain verify evidence.json");
    expect(CLI_QUICKSTART_SNIPPET).toMatch(/result: (VALID|VALID-WITH-WARNINGS|INCOMPLETE|INVALID)/);
    expect(CLI_QUICKSTART_SNIPPET).not.toMatch(/\bverified\b/i);
  });

  it("names the real MCP package, tools, and env var", () => {
    expect(MCP_CLAUDE_CODE_SNIPPET).toBe("claude mcp add fileonchain -- npx -y @fileonchain/mcp");
    expect(JSON.parse(MCP_CONFIG_SNIPPET).mcpServers.fileonchain.args).toEqual(["-y", "@fileonchain/mcp"]);
    expect(MCP_QUICKSTART_SNIPPET).toContain("verify_evidence");
    expect(MCP_QUICKSTART_SNIPPET).toContain("FILEONCHAIN_API_KEY");
  });
});
