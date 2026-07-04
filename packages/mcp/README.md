# @fileonchain/mcp

MCP (Model Context Protocol) server for [FileOnChain](https://fileonchain.org).
Gives AI agents chain-registry lookups, CID validation, and API-backed CID
anchoring over stdio.

## Tools

Read-only (no configuration needed — served from the `@fileonchain/utils`
registry):

| Tool | What it does |
| --- | --- |
| `list_chains` | Supported chains with family, testnet flag, and provisioning status |
| `get_chain` | Full registry entry for one chain id |
| `validate_cid` | Check a string is a CIDv1 base32 CID |
| `parse_anchor_payload` | Decode an on-chain memo/remark/metadata string as a FileOnChain anchor |
| `build_explorer_url` | Explorer link for a tx hash or address |

API-backed (spend account credits via the hosted FileOnChain API; the
server never holds private keys):

| Tool | What it does |
| --- | --- |
| `anchor_cid` | Anchor a CID on one or more chains (`POST /api/v1/anchor`) |
| `get_anchor_job` | Fetch or poll an anchor job |
| `get_credits` | Account credit balance |

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `FILEONCHAIN_API_KEY` | For the API-backed tools | Dashboard API key (`fok_…`) from <https://fileonchain.org/dashboard/keys> |
| `FILEONCHAIN_API_URL` | No | API origin override (defaults to `https://fileonchain.org`) |

## Usage

From npm (once published):

```json
{
  "mcpServers": {
    "fileonchain": {
      "command": "npx",
      "args": ["-y", "@fileonchain/mcp"],
      "env": { "FILEONCHAIN_API_KEY": "${FILEONCHAIN_API_KEY}" }
    }
  }
}
```

From this repo (run `pnpm build` first):

```json
{
  "mcpServers": {
    "fileonchain": {
      "command": "node",
      "args": ["packages/mcp/dist/index.js"],
      "env": { "FILEONCHAIN_API_KEY": "${FILEONCHAIN_API_KEY}" }
    }
  }
}
```

Or with the Claude Code CLI: `claude mcp add fileonchain -- npx -y @fileonchain/mcp`.
