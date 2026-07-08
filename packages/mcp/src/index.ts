import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { FileOnChainApiError, FileOnChainClient } from "@fileonchain/api";
import {
  buildAddressUrl,
  buildTxUrl,
  CHAIN_FAMILIES,
  CHAINS,
  getChain,
  isChainProvisioned,
  parseAnchorPayload,
  validateOrError,
  type ChainFamily,
  type ChainId,
} from "@fileonchain/utils";

/**
 * FileOnChain MCP server (stdio).
 *
 * Read-only tools run locally off the @fileonchain/utils registry. Anchoring
 * and account tools call the hosted HTTP API and need FILEONCHAIN_API_KEY
 * (a dashboard `fok_…` key) in the environment — no private keys ever live
 * here. FILEONCHAIN_API_URL overrides the API origin for self-hosted
 * deployments.
 */

const server = new McpServer({ name: "fileonchain", version: "0.1.0" });

const familyEnum = z.enum(CHAIN_FAMILIES as [ChainFamily, ...ChainFamily[]]);
const chainIdSchema = z
  .string()
  .describe('Chain id in "<family>:<name>" form, e.g. "substrate:autonomys-mainnet" or "evm:8453"');

const json = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

const toolError = (message: string) => ({
  content: [{ type: "text" as const, text: message }],
  isError: true,
});

/** Lazily constructed so read-only tools work without any env. */
const getApiClient = (): FileOnChainClient => {
  const apiKey = process.env.FILEONCHAIN_API_KEY;
  if (!apiKey) {
    throw new Error(
      "FILEONCHAIN_API_KEY is not set. Create an API key in the FileOnChain dashboard (https://fileonchain.org/dashboard/keys) and export it before using anchoring or account tools.",
    );
  }
  return new FileOnChainClient({ apiKey, baseUrl: process.env.FILEONCHAIN_API_URL });
};

const runApiTool = async (run: (client: FileOnChainClient) => Promise<unknown>) => {
  try {
    return json(await run(getApiClient()));
  } catch (error) {
    if (error instanceof FileOnChainApiError) {
      return toolError(`FileOnChain API error ${error.status}: ${error.body?.error ?? error.message}`);
    }
    return toolError(error instanceof Error ? error.message : String(error));
  }
};

server.registerTool(
  "list_chains",
  {
    title: "List supported chains",
    description:
      "List the chains FileOnChain can anchor on, with family, testnet flag, rollout status (active/planned/deprecated — only active chains accept uploads), and whether real anchoring is provisioned today.",
    inputSchema: {
      family: familyEnum.optional().describe("Only chains of this family"),
      includeTestnets: z.boolean().optional().describe("Include testnet entries (default true)"),
    },
  },
  async ({ family, includeTestnets = true }) => {
    const chains = CHAINS.filter(
      (chain) =>
        (!family || chain.family === family) && (includeTestnets || !chain.testnet),
    ).map((chain) => ({
      id: chain.id,
      name: chain.name,
      family: chain.family,
      status: chain.status,
      testnet: chain.testnet ?? false,
      provisioned: isChainProvisioned(chain),
    }));
    return json({ chains });
  },
);

server.registerTool(
  "get_chain",
  {
    title: "Get chain details",
    description: "Full registry entry for one chain (RPC, explorer, contract addresses, provisioning fields).",
    inputSchema: { chainId: chainIdSchema },
  },
  async ({ chainId }) => {
    const chain = getChain(chainId as ChainId);
    if (!chain) return toolError(`Unknown chain "${chainId}". Use list_chains to see valid ids.`);
    return json({ ...chain, provisioned: isChainProvisioned(chain) });
  },
);

server.registerTool(
  "validate_cid",
  {
    title: "Validate a CID",
    description: "Check whether a string is a CIDv1 base32 CID (the form FileOnChain anchors).",
    inputSchema: { cid: z.string() },
  },
  async ({ cid }) => {
    const error = validateOrError(cid);
    return json(error ? { valid: false, error } : { valid: true });
  },
);

server.registerTool(
  "parse_anchor_payload",
  {
    title: "Parse an anchor payload",
    description:
      "Parse an on-chain string (memo, remark, metadata, comment, registry uri) as a FileOnChain anchor payload.",
    inputSchema: { payload: z.string() },
  },
  async ({ payload }) => {
    const parsed = parseAnchorPayload(payload);
    return json(parsed ?? { recognized: false });
  },
);

server.registerTool(
  "build_explorer_url",
  {
    title: "Build an explorer URL",
    description: "Block-explorer link for a transaction hash or address on a given chain.",
    inputSchema: {
      chainId: chainIdSchema,
      txHash: z.string().optional().describe("Transaction hash (provide this or address)"),
      address: z.string().optional().describe("Account or contract address"),
    },
  },
  async ({ chainId, txHash, address }) => {
    const chain = getChain(chainId as ChainId);
    if (!chain) return toolError(`Unknown chain "${chainId}". Use list_chains to see valid ids.`);
    if (txHash) return json({ url: buildTxUrl(chain, txHash) });
    if (address) return json({ url: buildAddressUrl(chain, address) });
    return toolError("Provide either txHash or address.");
  },
);

server.registerTool(
  "anchor_cid",
  {
    title: "Anchor a CID",
    description:
      "Anchor a CID on one or more chains through the hosted FileOnChain API, paying with account credits (or a BYOK key). Requires FILEONCHAIN_API_KEY.",
    inputSchema: {
      cid: z.string().describe("CIDv1 base32 of the file or folder DAG root"),
      fileName: z.string(),
      fileSizeBytes: z.number().int().positive(),
      chunkCount: z.number().int().min(1).max(100_000),
      chainIds: z.array(chainIdSchema).nonempty(),
      paymentMethod: z.enum(["credits", "byok"]).default("credits"),
      byokKeyId: z.string().optional().describe('Required when paymentMethod is "byok"'),
      platformId: z
        .string()
        .regex(/^[0-9]+$/)
        .optional()
        .describe(
          "Registered platform id to attribute the anchor to (fee-split rev share); defaults to FileOnChain's platform",
        ),
    },
  },
  async ({ cid, fileName, fileSizeBytes, chunkCount, chainIds, paymentMethod, byokKeyId, platformId }) =>
    runApiTool((client) =>
      client.anchor({
        cid,
        fileName,
        fileSizeBytes,
        chunkCount,
        chainIds: chainIds as ChainId[],
        paymentMethod,
        byokKeyId,
        platformId,
      }),
    ),
);

server.registerTool(
  "get_anchor_job",
  {
    title: "Get an anchor job",
    description:
      "Fetch an anchor job by id (status, cost, per-chain transaction hashes, and the propose/verify verification state with its challenge-window deadline). Requires FILEONCHAIN_API_KEY.",
    inputSchema: {
      jobId: z.string(),
      wait: z.boolean().optional().describe("Poll until the job completes or fails (up to 2 minutes)"),
    },
  },
  async ({ jobId, wait }) =>
    runApiTool((client) => (wait ? client.waitForJob(jobId) : client.getJob(jobId))),
);

server.registerTool(
  "get_credits",
  {
    title: "Get credit balance",
    description: "Current account credit balance in micro-USDC and USDC. Requires FILEONCHAIN_API_KEY.",
    inputSchema: {},
  },
  async () => runApiTool((client) => client.getCredits()),
);

const transport = new StdioServerTransport();
await server.connect(transport);
