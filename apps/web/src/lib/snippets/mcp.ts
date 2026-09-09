/**
 * MCP install snippets for `@fileonchain/mcp`, shared by the homepage
 * quickstart, /docs, /agent-evidence and /integrations so the four never
 * drift apart. Client-safe: plain string constants, no server imports.
 *
 * The MCP server is a FileOnChain Cloud + reference-SDK integration, not
 * part of the Evidence Protocol. Every surface that shows these snippets
 * must say so; the local `verify_evidence` tool runs the same in-process
 * verifier as the CLI, and only the anchoring tools need an API key.
 */

/** One-liner for the Claude Code CLI. */
export const MCP_CLAUDE_CODE_SNIPPET =
  "claude mcp add fileonchain -- npx -y @fileonchain/mcp";

/** `mcpServers` entry for Cursor, Claude Desktop, and other JSON-configured clients. */
export const MCP_CONFIG_SNIPPET = `{
  "mcpServers": {
    "fileonchain": {
      "command": "npx",
      "args": ["-y", "@fileonchain/mcp"],
      "env": { "FILEONCHAIN_API_KEY": "\${FILEONCHAIN_API_KEY}" }
    }
  }
}`;

/**
 * The compact form for the homepage tab: the Claude Code one-liner, the
 * Cursor config, and the first thing to try. `verify_evidence` needs no
 * key; `FILEONCHAIN_API_KEY` is only for the Cloud-backed anchoring tools.
 */
export const MCP_QUICKSTART_SNIPPET = `# Claude Code
${MCP_CLAUDE_CODE_SNIPPET}

# Cursor / Claude Desktop: add to mcp.json
${MCP_CONFIG_SNIPPET}

# Then ask your agent to call verify_evidence on evidence.json.
# No key needed for verification; FILEONCHAIN_API_KEY only unlocks anchor_cid.`;
