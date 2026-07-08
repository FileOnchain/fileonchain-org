import * as React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import CodeBlock from "@/components/docs/CodeBlock";

export const metadata: Metadata = {
  title: "SDK Documentation",
  description:
    "How to anchor CIDs onchain with the @fileonchain packages: the @fileonchain/sdk umbrella, twelve per-family anchor clients, the hosted API client, and the MCP server for AI agents.",
  alternates: { canonical: "/docs" },
  openGraph: {
    title: "SDK Documentation · FileOnChain",
    description:
      "Anchor CIDs across twelve chain families with the @fileonchain/* packages — umbrella SDK, family clients, hosted API, and MCP server.",
    url: "/docs",
    type: "website",
  },
  // Without this, the root layout's twitter block (homepage copy) is
  // inherited wholesale — metadata merges shallowly per top-level key.
  twitter: {
    card: "summary_large_image",
    title: "SDK Documentation · FileOnChain",
    description:
      "Anchor CIDs across twelve chain families with the @fileonchain/* packages — umbrella SDK, family clients, hosted API, and MCP server.",
  },
};

const GITHUB_PACKAGES = "https://github.com/FileOnchain/fileonchain-org/tree/main/packages";

/* ------------------------------------------------------------------ */
/* Code snippets — kept as constants so the JSX below stays readable. */
/* ------------------------------------------------------------------ */

const INSTALL_SNIPPET = `pnpm add @fileonchain/sdk
# EVM chains additionally need:       pnpm add viem
# Substrate chains additionally need: pnpm add @polkadot/api
# Solana chains additionally need:    pnpm add @solana/web3.js
# The other nine families are dependency-free.`;

const REGISTRY_SNIPPET = `import { CHAINS, getChain, getChainsByFamily, buildTxUrl, isValidCID } from "@fileonchain/sdk";

const base = getChain("evm:8453");
base?.registryContract; // FileRegistry address on Base (null / zero until deployed)

getChainsByFamily("substrate").map((c) => c.name);
isValidCID("bafybeig..."); // CIDv1 base32 check

buildTxUrl(base!, "0xabc..."); // explorer link for a transaction`;

const CHUNKED_SNIPPET = `import { anchorChunkedFile } from "@fileonchain/sdk/substrate";

const receipt = await anchorChunkedFile(api, {
  chainId: "substrate:autonomys-mainnet",
  address: "5F...",
  signer: injectedSigner,
  fileCid: "bafybeig...",
  chunks: [{ cid: "bafk...", index: 0, nextCid: undefined, data: bytes }],
  onProgress: ({ stage, chunksAnchored, chunksTotal }) => {
    // "connecting" | "signing" | "submitting" | "confirming" | "confirmed"
  },
});

receipt.txHashes; // every transaction sent
receipt.txHash;   // the file-level anchor (always sent last)`;

const EVM_SNIPPET = `import { proposeAnchor, getVerifiedRecord } from "@fileonchain/sdk/evm";
import { createWalletClient, custom } from "viem";

const walletClient = createWalletClient({
  account: "0x...",
  transport: custom(window.ethereum),
});

// Escrows a FOCAT tip + bond; verifies after the challenge window.
const receipt = await proposeAnchor(walletClient, {
  chainId: "evm:8453",
  cid: "bafybeig...",
  uri: "ipfs://bafybeig...",
});
receipt.proposalId;
receipt.challengeDeadline; // unix seconds

// Later — anyone can verify without a wallet:
const record = await getVerifiedRecord("evm:8453", "bafybeig...");
record?.submitter;`;

const SUBSTRATE_SNIPPET = `import { anchorCIDWithRemark } from "@fileonchain/sdk/substrate";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { getChain } from "@fileonchain/sdk";

const chain = getChain("substrate:autonomys-mainnet")!;
const api = await ApiPromise.create({ provider: new WsProvider(chain.rpcUrl) });

const receipt = await anchorCIDWithRemark(api, {
  chainId: "substrate:autonomys-mainnet",
  address: "5F...",
  signer: injectedSigner, // e.g. from @polkadot/extension-dapp
  cid: "bafybeig...",
});`;

const SOLANA_SNIPPET = `import { anchorCIDWithMemo } from "@fileonchain/sdk/solana";
import { Connection } from "@solana/web3.js";

const connection = new Connection(rpcUrl);

// \`wallet\` is any SolanaAnchorSigner — Phantom, Solflare, and
// wallet-standard adapters match the interface out of the box.
const { signature, slot, memo } = await anchorCIDWithMemo(connection, wallet, {
  chainId: "solana:mainnet",
  cid: "bafybeig...",
});`;

const SIGNER_SNIPPET = `import { anchorChunkedFile } from "@fileonchain/sdk/aptos";

// The dependency-free families take a minimal structural signer —
// adapt an injected wallet (browser) or the chain's SDK (server).
const receipt = await anchorChunkedFile(petraWallet, {
  chainId: "aptos:mainnet",
  fileCid: "bafybeig...",
  chunks: [{ cid: "bafk...", index: 0 }],
  onProgress: ({ stage, chunksAnchored, chunksTotal }) => {},
});`;

const API_SNIPPET = `import { FileOnChainClient, FileOnChainApiError } from "@fileonchain/api";

const client = new FileOnChainClient({
  apiKey: process.env.FILEONCHAIN_API_KEY!, // fok_… from /dashboard/keys
});

const job = await client.anchor({
  cid: "bafybeig...",
  fileName: "data.bin",
  fileSizeBytes: 150_000,
  chunkCount: 3,
  chainIds: ["evm:8453"], // must be status: "active" chains
  paymentMethod: "credits",
});

job.txHashes;                    // one { chainId, txHash, blockNumber } per chain
await client.waitForJob(job.id); // poll until complete/failed
await client.getCredits();       // { balanceMicroUsdc, balanceUsdc }`;

const MCP_SNIPPET = `{
  "mcpServers": {
    "fileonchain": {
      "command": "npx",
      "args": ["-y", "@fileonchain/mcp"],
      "env": { "FILEONCHAIN_API_KEY": "\${FILEONCHAIN_API_KEY}" }
    }
  }
}`;

const MCP_CLAUDE_SNIPPET = `claude mcp add fileonchain -- npx -y @fileonchain/mcp`;

const PROVISIONING_SNIPPET = `import { getChain, isChainProvisioned, ChainNotProvisionedError } from "@fileonchain/sdk";

const chain = getChain("aptos:mainnet")!;
if (!isChainProvisioned(chain)) {
  // anchorCID / anchorChunkedFile would throw ChainNotProvisionedError here —
  // nothing is deployed on this chain yet, so fall back or pick another chain.
}`;

/* ------------------------------------------------------------------ */
/* Reference data                                                      */
/* ------------------------------------------------------------------ */

interface FamilyRow {
  pkg: string;
  subpath: string;
  method: string;
  peer: string | null;
  signer: string;
}

const FAMILY_ROWS: FamilyRow[] = [
  {
    pkg: "sdk-evm",
    subpath: "evm",
    method: "FileRegistry.anchorCID contract call per chunk + file",
    peer: "viem",
    signer: "viem WalletClient",
  },
  {
    pkg: "sdk-substrate",
    subpath: "substrate",
    method: "system.remarkWithEvent batched via utility.batchAll",
    peer: "@polkadot/api",
    signer: "polkadot.js signer",
  },
  {
    pkg: "sdk-solana",
    subpath: "solana",
    method: "SPL Memo program (native — always provisioned)",
    peer: "@solana/web3.js",
    signer: "SolanaAnchorSigner",
  },
  {
    pkg: "sdk-aptos",
    subpath: "aptos",
    method: "Move module file_registry::anchor_cid",
    peer: null,
    signer: "AptosAnchorSigner",
  },
  {
    pkg: "sdk-cosmos",
    subpath: "cosmos",
    method: "Transaction memo, one payload per tx",
    peer: null,
    signer: "CosmosAnchorSigner",
  },
  {
    pkg: "sdk-sui",
    subpath: "sui",
    method: "Move calls batched into programmable transaction blocks",
    peer: null,
    signer: "SuiAnchorSigner",
  },
  {
    pkg: "sdk-starknet",
    subpath: "starknet",
    method: "anchor_cid multicalls on the Cairo FileRegistry",
    peer: null,
    signer: "StarknetAnchorSigner",
  },
  {
    pkg: "sdk-near",
    subpath: "near",
    method: "anchor_cid on the WASM registry contract",
    peer: null,
    signer: "NearAnchorSigner",
  },
  {
    pkg: "sdk-tron",
    subpath: "tron",
    method: "Transaction data/memo field, one payload per tx",
    peer: null,
    signer: "TronAnchorSigner",
  },
  {
    pkg: "sdk-cardano",
    subpath: "cardano",
    method: "CIP-20 transaction metadata (label 674)",
    peer: null,
    signer: "CardanoAnchorSigner",
  },
  {
    pkg: "sdk-ton",
    subpath: "ton",
    method: "Text comment on a minimal self-transfer",
    peer: null,
    signer: "TonAnchorSigner",
  },
  {
    pkg: "sdk-hedera",
    subpath: "hedera",
    method: "Consensus Service message on the registry topic",
    peer: null,
    signer: "HederaAnchorSigner",
  },
];

const TOC = [
  { href: "#getting-started", label: "Getting started" },
  { href: "#umbrella", label: "@fileonchain/sdk" },
  { href: "#utils", label: "@fileonchain/utils" },
  { href: "#families", label: "Family clients" },
  { href: "#api", label: "@fileonchain/api" },
  { href: "#mcp", label: "@fileonchain/mcp" },
  { href: "#concepts", label: "Shared concepts" },
] as const;

/* ------------------------------------------------------------------ */
/* Local layout helpers                                                */
/* ------------------------------------------------------------------ */

const SectionHeading = ({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) => (
  <h2
    id={id}
    className="scroll-mt-24 text-2xl font-bold tracking-tight text-foreground"
  >
    {children}
  </h2>
);

const PackageLink = ({ dir }: { dir: string }) => (
  <a
    href={`${GITHUB_PACKAGES}/${dir}`}
    target="_blank"
    rel="noopener noreferrer"
    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
  >
    Source &amp; README →
  </a>
);

/**
 * Docs — developer guide for the @fileonchain/* packages. Server component
 * on purpose: everything here is static reference content, so it ships as
 * plain indexable HTML (the CopyButtons inside CodeBlock are the only
 * client islands).
 */
const DocsPage = () => (
  <PageShell size="default" padding="lg" atmosphere>
    <PageHeader
      className="mb-10"
      index="07"
      kicker="Developer guide"
      title="Build with the SDK."
      lede="Everything on fileonchain.org runs on the open-source @fileonchain packages. Anchor CIDs from your own app with a wallet, through the hosted API with credits, or from an AI agent over MCP."
    />

    {/* In-page TOC */}
    <nav aria-label="On this page" className="mb-12 flex flex-wrap gap-2">
      {TOC.map(({ href, label }) => (
        <a
          key={href}
          href={href}
          className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted transition-colors duration-base hover:border-primary/40 hover:text-foreground"
        >
          {label}
        </a>
      ))}
    </nav>

    <div className="space-y-16">
      {/* ------------------------------------------------------------ */}
      <section id="getting-started" className="scroll-mt-24 space-y-6">
        <SectionHeading id="getting-started-heading">Getting started</SectionHeading>
        <p className="text-sm leading-relaxed text-muted md:text-base">
          There are three ways to anchor a CID, depending on who signs the
          transaction:
        </p>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardTitle className="font-mono text-sm">@fileonchain/sdk</CardTitle>
            <CardDescription className="mt-2">
              Self-signed anchoring from your own app. Your users&apos; wallets (or
              your server&apos;s keys) sign; you talk to the chain directly. One
              umbrella package, twelve chain families.
            </CardDescription>
          </Card>
          <Card>
            <CardTitle className="font-mono text-sm">@fileonchain/api</CardTitle>
            <CardDescription className="mt-2">
              Hosted anchoring with account credits. FileOnChain&apos;s workers
              sign and send — no wallet, no chain SDK, just an{" "}
              <code className="font-mono text-xs">fok_</code> API key from the
              dashboard.
            </CardDescription>
          </Card>
          <Card>
            <CardTitle className="font-mono text-sm">@fileonchain/mcp</CardTitle>
            <CardDescription className="mt-2">
              Anchoring for AI agents. A stdio MCP server exposing registry
              lookups, CID validation, and API-backed anchoring as tools.
            </CardDescription>
          </Card>
        </div>

        <CodeBlock title="terminal" code={INSTALL_SNIPPET} />
      </section>

      {/* ------------------------------------------------------------ */}
      <section id="umbrella" className="scroll-mt-24 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading id="umbrella-heading">
            <span className="font-mono">@fileonchain/sdk</span> — the umbrella
          </SectionHeading>
          <PackageLink dir="sdk" />
        </div>
        <p className="text-sm leading-relaxed text-muted md:text-base">
          The package most apps should install. The root entry re-exports the
          entire dependency-free core (chain registry, CID validation, anchor
          payloads) plus the EVM contract ABIs. Each chain family lives on its own
          subpath — <code className="font-mono text-xs">@fileonchain/sdk/evm</code>,{" "}
          <code className="font-mono text-xs">…/substrate</code>,{" "}
          <code className="font-mono text-xs">…/solana</code>, and so on through
          all twelve — and <code className="font-mono text-xs">…/api</code>{" "}
          re-exports the hosted API client. Heavy chain dependencies stay
          opt-in: only the EVM, Substrate, and Solana subpaths have (optional)
          peer dependencies.
        </p>
        <CodeBlock title="registry.ts" code={REGISTRY_SNIPPET} />
        <p className="text-sm leading-relaxed text-muted md:text-base">
          Every family exports the same{" "}
          <code className="font-mono text-xs">anchorChunkedFile</code> with an
          identical progress and receipt shape — chunk anchors first, the
          file-level anchor last (indexers rely on that ordering). A folder
          anchors exactly like a file: anchor the CID of its DAG root. On
          contract chains the file-level anchor is a paid{" "}
          <code className="font-mono text-xs">proposeAnchor</code> that escrows
          a FOCAT tip + bond and verifies after a challenge window — the{" "}
          <Link href="/protocol" className="text-primary underline underline-offset-2">
            protocol page
          </Link>{" "}
          explains the token, the fee split, and every contract in the suite.
        </p>
        <CodeBlock title="anchor.ts" code={CHUNKED_SNIPPET} />
      </section>

      {/* ------------------------------------------------------------ */}
      <section id="utils" className="scroll-mt-24 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading id="utils-heading">
            <span className="font-mono">@fileonchain/utils</span> — the core
          </SectionHeading>
          <PackageLink dir="utils" />
        </div>
        <p className="text-sm leading-relaxed text-muted md:text-base">
          The dependency-free foundation everything else builds on — the
          umbrella&apos;s root entry re-exports all of it, so you only depend on
          it directly when you want chain metadata without any anchoring code.
          It is the single source of truth for:
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted md:text-base">
          <li>
            <span className="font-medium text-foreground">The chain registry</span> —{" "}
            <code className="font-mono text-xs">CHAINS</code>,{" "}
            <code className="font-mono text-xs">getChain(id)</code>,{" "}
            <code className="font-mono text-xs">getChainsByFamily(family)</code>,{" "}
            <code className="font-mono text-xs">MAINNET_CHAINS</code> /{" "}
            <code className="font-mono text-xs">TESTNET_CHAINS</code>, and explorer
            helpers <code className="font-mono text-xs">buildTxUrl</code> /{" "}
            <code className="font-mono text-xs">buildAddressUrl</code>. Contract
            addresses live on the chain entries themselves.
          </li>
          <li>
            <span className="font-medium text-foreground">CID validation</span> —{" "}
            <code className="font-mono text-xs">isValidCID</code> and{" "}
            <code className="font-mono text-xs">validateOrError</code> (CIDv1
            base32).
          </li>
          <li>
            <span className="font-medium text-foreground">The anchor vocabulary</span> —{" "}
            <code className="font-mono text-xs">buildFileAnchorPayload</code>,{" "}
            <code className="font-mono text-xs">buildChunkAnchorPayload</code>, and{" "}
            <code className="font-mono text-xs">parseAnchorPayload</code>: the
            versioned JSON payloads written identically on every family.
          </li>
          <li>
            <span className="font-medium text-foreground">Orchestration helpers</span> —{" "}
            <code className="font-mono text-xs">buildChunkedAnchorPayloads</code>,{" "}
            <code className="font-mono text-xs">assertPayloadFits</code>,{" "}
            <code className="font-mono text-xs">batchByBytes</code> /{" "}
            <code className="font-mono text-xs">batchByCount</code>, and{" "}
            <code className="font-mono text-xs">runSequentialChunkedAnchor</code> —
            the shared machinery behind every family client.
          </li>
        </ul>
      </section>

      {/* ------------------------------------------------------------ */}
      <section id="families" className="scroll-mt-24 space-y-6">
        <SectionHeading id="families-heading">
          Family clients — <span className="font-mono">@fileonchain/sdk-*</span>
        </SectionHeading>
        <p className="text-sm leading-relaxed text-muted md:text-base">
          One anchor client per chain family, all published standalone and
          re-exported by the umbrella. Nine of the twelve are fully
          dependency-free: the SDK owns payload building, ordering, batching,
          and size validation, while a minimal structural signer interface owns
          transport — adapt an injected wallet in the browser or the chain&apos;s
          own SDK on a server.
        </p>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-elevated/60">
                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Package
                </th>
                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                  How it anchors
                </th>
                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Peer dependency
                </th>
                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Signer
                </th>
              </tr>
            </thead>
            <tbody>
              {FAMILY_ROWS.map((row) => (
                <tr key={row.pkg} className="border-b border-border last:border-b-0">
                  <td className="whitespace-nowrap px-4 py-3">
                    <a
                      href={`${GITHUB_PACKAGES}/${row.pkg}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-foreground underline-offset-4 hover:text-primary hover:underline"
                    >
                      @fileonchain/{row.pkg}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-muted">{row.method}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {row.peer ? (
                      <code className="font-mono text-xs text-foreground">{row.peer}</code>
                    ) : (
                      <Badge variant="success" size="sm">
                        dependency-free
                      </Badge>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted">
                    {row.signer}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-sm leading-relaxed text-muted md:text-base">
          Every package is also importable as{" "}
          <code className="font-mono text-xs">@fileonchain/sdk/&lt;family&gt;</code>.
          Besides <code className="font-mono text-xs">anchorChunkedFile</code>, each
          exposes a file-level entrypoint —{" "}
          <code className="font-mono text-xs">anchorCID</code> on the contract
          families,{" "}
          <code className="font-mono text-xs">anchorCIDWithRemark</code> /{" "}
          <code className="font-mono text-xs">anchorCIDWithMemo</code> /{" "}
          <code className="font-mono text-xs">anchorCIDWithMetadata</code> /{" "}
          <code className="font-mono text-xs">anchorCIDWithComment</code> /{" "}
          <code className="font-mono text-xs">anchorCIDWithMessage</code> on the
          remark, memo, metadata, comment, and consensus-message families.
        </p>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-foreground">
            EVM — contract calls with viem
          </h3>
          <CodeBlock title="evm.ts" code={EVM_SNIPPET} />

          <h3 className="text-lg font-semibold text-foreground">
            Substrate — remarks with @polkadot/api
          </h3>
          <CodeBlock title="substrate.ts" code={SUBSTRATE_SNIPPET} />

          <h3 className="text-lg font-semibold text-foreground">
            Solana — SPL Memo with @solana/web3.js
          </h3>
          <CodeBlock title="solana.ts" code={SOLANA_SNIPPET} />

          <h3 className="text-lg font-semibold text-foreground">
            The dependency-free nine — bring a signer
          </h3>
          <p className="text-sm leading-relaxed text-muted md:text-base">
            Aptos, Cosmos, Sui, Starknet, NEAR, TRON, Cardano, TON, and Hedera
            follow the same pattern: the client takes a small signer object
            instead of a chain SDK. Injected wallets (Petra, Keplr, Argent,
            TronLink, …) match the interfaces directly; on a server, wrap the
            chain&apos;s SDK in a few lines.
          </p>
          <CodeBlock title="aptos.ts" code={SIGNER_SNIPPET} />
        </div>
      </section>

      {/* ------------------------------------------------------------ */}
      <section id="api" className="scroll-mt-24 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading id="api-heading">
            <span className="font-mono">@fileonchain/api</span> — hosted anchoring
          </SectionHeading>
          <PackageLink dir="api" />
        </div>
        <p className="text-sm leading-relaxed text-muted md:text-base">
          A zero-dependency typed client for the hosted{" "}
          <code className="font-mono text-xs">/api/v1/*</code> endpoints.
          FileOnChain&apos;s workers sign and send the transactions, paid with
          account credits — useful when you don&apos;t want wallets or chain SDKs
          anywhere near your code. Create an API key under{" "}
          <Link
            href="/dashboard/keys"
            className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
          >
            Dashboard → API keys
          </Link>
          .
        </p>
        <CodeBlock title="hosted.ts" code={API_SNIPPET} />
        <p className="text-sm leading-relaxed text-muted md:text-base">
          Errors surface as{" "}
          <code className="font-mono text-xs">FileOnChainApiError</code> with a{" "}
          <code className="font-mono text-xs">.status</code>: 401 bad key, 402
          insufficient credits, 502 on-chain send failed (credits are refunded).
        </p>
      </section>

      {/* ------------------------------------------------------------ */}
      <section id="mcp" className="scroll-mt-24 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading id="mcp-heading">
            <span className="font-mono">@fileonchain/mcp</span> — for AI agents
          </SectionHeading>
          <PackageLink dir="mcp" />
        </div>
        <p className="text-sm leading-relaxed text-muted md:text-base">
          A stdio MCP (Model Context Protocol) server. Five read-only tools
          serve the chain registry with no configuration (
          <code className="font-mono text-xs">list_chains</code>,{" "}
          <code className="font-mono text-xs">get_chain</code>,{" "}
          <code className="font-mono text-xs">validate_cid</code>,{" "}
          <code className="font-mono text-xs">parse_anchor_payload</code>,{" "}
          <code className="font-mono text-xs">build_explorer_url</code>); three
          API-backed tools (
          <code className="font-mono text-xs">anchor_cid</code>,{" "}
          <code className="font-mono text-xs">get_anchor_job</code>,{" "}
          <code className="font-mono text-xs">get_credits</code>) spend account
          credits through the hosted API — the server never holds private keys.
        </p>
        <CodeBlock title="mcp-config.json" code={MCP_SNIPPET} />
        <p className="text-sm leading-relaxed text-muted md:text-base">
          Or with the Claude Code CLI:
        </p>
        <CodeBlock title="terminal" code={MCP_CLAUDE_SNIPPET} />
        <p className="text-sm leading-relaxed text-muted md:text-base">
          <code className="font-mono text-xs">FILEONCHAIN_API_KEY</code> is required
          only for the anchoring tools;{" "}
          <code className="font-mono text-xs">FILEONCHAIN_API_URL</code> optionally
          overrides the API origin.
        </p>
      </section>

      {/* ------------------------------------------------------------ */}
      <section id="concepts" className="scroll-mt-24 space-y-6">
        <SectionHeading id="concepts-heading">Shared concepts</SectionHeading>
        <div className="space-y-4">
          <Card>
            <CardTitle>One payload vocabulary, twelve runtimes</CardTitle>
            <CardDescription className="mt-2 leading-relaxed">
              Every family writes the same versioned JSON payloads (
              <code className="font-mono text-xs">
                {'{ p: "fileonchain", v: 1, op: "anchor" | "chunk", … }'}
              </code>
              ) — whether they land in a contract call, a remark, a memo, or a
              consensus message. Any indexer can read anchors back with{" "}
              <code className="font-mono text-xs">parseAnchorPayload</code>,
              regardless of chain.
            </CardDescription>
          </Card>
          <Card>
            <CardTitle>One receipt shape</CardTitle>
            <CardDescription className="mt-2 leading-relaxed">
              Every <code className="font-mono text-xs">anchorChunkedFile</code>{" "}
              resolves to the same{" "}
              <code className="font-mono text-xs">ChunkedAnchorReceipt</code> —{" "}
              <code className="font-mono text-xs">txHashes</code> for every
              transaction sent and{" "}
              <code className="font-mono text-xs">txHash</code> for the file-level
              anchor — and reports the same{" "}
              <code className="font-mono text-xs">AnchorProgress</code> stages, so
              one progress UI covers all twelve families.
            </CardDescription>
          </Card>
          <Card>
            <CardTitle>Provisioning</CardTitle>
            <CardDescription className="mt-2 leading-relaxed">
              A chain is &quot;provisioned&quot; when its registry entry carries a
              deployed contract, module, program, or topic. Anchoring on an
              unprovisioned chain throws{" "}
              <code className="font-mono text-xs">ChainNotProvisionedError</code>;
              check first with{" "}
              <code className="font-mono text-xs">isChainProvisioned(chain)</code>.
            </CardDescription>
          </Card>
        </div>
        <CodeBlock title="provisioning.ts" code={PROVISIONING_SNIPPET} />
      </section>
    </div>

    {/* Footer note */}
    <section className="mt-16 rounded-2xl border border-dashed border-border bg-surface/60 p-5 text-sm text-muted">
      <p>
        Each package ships its own README with the full API surface —{" "}
        <a
          href={GITHUB_PACKAGES}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
        >
          browse them on GitHub
        </a>
        . Anchoring something? The{" "}
        <Link
          href="/"
          className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
        >
          uploader
        </Link>{" "}
        runs on these exact packages, and the{" "}
        <Link
          href="/explorer"
          className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
        >
          explorer
        </Link>{" "}
        shows what lands onchain.
      </p>
    </section>
  </PageShell>
);

export default DocsPage;
