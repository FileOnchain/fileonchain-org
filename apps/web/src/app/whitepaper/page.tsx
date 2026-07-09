import * as React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { CHAIN_FAMILIES, MAINNET_CHAINS, TESTNET_CHAINS } from "@fileonchain/sdk";

export const metadata: Metadata = {
  title: "White Paper",
  description:
    "The FileOnChain white paper: one anchor payload across twelve chain families, an optimistic propose/verify market backed by the FOCAT token, EVM-hubbed governance, and storage decoupled from proof.",
  alternates: { canonical: "/whitepaper" },
  openGraph: {
    title: "White Paper · FileOnChain",
    description:
      "A chain-agnostic protocol for permanent, verifiable file anchoring — the design, the verification market, the FOCAT token, and governance.",
    url: "/whitepaper",
    type: "article",
  },
  // Without this, the root layout's twitter block (homepage copy) is
  // inherited wholesale — metadata merges shallowly per top-level key.
  twitter: {
    card: "summary_large_image",
    title: "White Paper · FileOnChain",
    description:
      "A chain-agnostic protocol for permanent, verifiable file anchoring — the design, the verification market, the FOCAT token, and governance.",
  },
};

const GITHUB_REPO = "https://github.com/FileOnchain/fileonchain-org";
const WHITEPAPER_MD = `${GITHUB_REPO}/blob/main/docs/whitepaper.md`;

/* ------------------------------------------------------------------ */
/* Reference data                                                      */
/* ------------------------------------------------------------------ */

const TOC = [
  { href: "#abstract", label: "Abstract" },
  { href: "#motivation", label: "1 · Motivation" },
  { href: "#principles", label: "2 · Design principles" },
  { href: "#system", label: "3 · System overview" },
  { href: "#chains", label: "4 · Chain families" },
  { href: "#protocol", label: "5 · Anchor protocol" },
  { href: "#token", label: "6 · FOCAT token" },
  { href: "#governance", label: "7 · Governance" },
  { href: "#storage", label: "8 · Storage" },
  { href: "#access", label: "9 · Access paths" },
  { href: "#security", label: "10 · Security" },
  { href: "#status", label: "11 · Status" },
  { href: "#conclusion", label: "12 · Conclusion" },
] as const;

const PRINCIPLES = [
  {
    title: "Content addressing over location addressing",
    body: "Files are identified by CIDv1 hashes — valid forever, verifiable by anyone holding the bytes. The anchor commits to what the file is, never where it lives.",
  },
  {
    title: "Chain-agnostic by construction",
    body: "The payload written on-chain is byte-identical on every family. Chains differ only in the transaction envelope — a contract call, a remark, a memo, metadata, or a consensus message.",
  },
  {
    title: "Meet each chain where it is",
    body: "Contract runtimes get the full verification protocol; memo-capable chains get lightweight anchoring through native channels with no deployment required.",
  },
  {
    title: "Optimistic verification",
    body: "Most anchors are honest, so the fast path is cheap: propose, wait out a challenge window, finalize. Disputes are the expensive exception, resolved by staked-validator juries.",
  },
  {
    title: "Storage is a market, not a promise",
    body: "Anchoring proves; caching serves. Private caching is paid and end-to-end encrypted; public caching is donation-funded. Neither is required for an anchor to remain valid.",
  },
  {
    title: "Open everything",
    body: "Contracts, SDKs, the webapp, the API surface, and this document are MIT-licensed and developed in the open.",
  },
] as const;

const FILE_PAYLOAD_FIELDS = [
  { field: "p", type: '"fileonchain"', meaning: "Protocol tag" },
  { field: "v", type: "1", meaning: "Payload version" },
  { field: "op", type: '"anchor"', meaning: "Operation" },
  { field: "cid", type: "string", meaning: "CIDv1 of the file or folder DAG root" },
  { field: "sha256", type: "string · optional", meaning: "SHA-256 (hex) of the raw content" },
  { field: "uri", type: "string · optional", meaning: "IPFS / Arweave pointer" },
  {
    field: "pid",
    type: "string · optional",
    meaning: "Originating platform id (integrator attribution)",
  },
] as const;

const CHUNK_PAYLOAD_FIELDS = [
  { field: "op", type: '"chunk"', meaning: "Operation (p and v as above)" },
  { field: "cid", type: "string", meaning: "CIDv1 of this chunk" },
  { field: "fileCid", type: "string", meaning: "CIDv1 of the whole file" },
  { field: "idx", type: "number", meaning: "Zero-based chunk index" },
  { field: "total", type: "number", meaning: "Total chunks in the file" },
  {
    field: "next",
    type: "string · optional",
    meaning: "CIDv1 of the next chunk (omitted on the last)",
  },
  {
    field: "d",
    type: "string · optional",
    meaning: "Base64 chunk bytes — only on data-carrying chains",
  },
] as const;

const TRANSPORT_ROWS = [
  {
    family: "EVM",
    transport:
      "FileRegistry contract call per chunk + file; paid proposeAnchor for verification",
    deployment: "Contract suite",
  },
  {
    family: "Substrate",
    transport:
      "system.remarkWithEvent batched via utility.batchAll; chunk bytes embedded where supported (Autonomys)",
    deployment: null,
  },
  { family: "Solana", transport: "SPL Memo program", deployment: null },
  {
    family: "Aptos",
    transport: "Move module file_registry::anchor_cid; anchor_registry for the protocol",
    deployment: "Move package",
  },
  {
    family: "Cosmos",
    transport: "Transaction memo, one payload per transaction",
    deployment: null,
  },
  {
    family: "Sui",
    transport: "Move calls batched into one programmable transaction block",
    deployment: "Move package",
  },
  {
    family: "Starknet",
    transport: "anchor_cid multicalls on the Cairo FileRegistry",
    deployment: "Cairo contracts",
  },
  {
    family: "NEAR",
    transport: "anchor_cid on the WASM registry contract",
    deployment: "Rust contracts",
  },
  {
    family: "TRON",
    transport:
      "Transaction data/memo field (the EVM suite compiles for TVM as an upgrade path)",
    deployment: null,
  },
  {
    family: "Cardano",
    transport: "CIP-20 transaction metadata (label 674)",
    deployment: null,
  },
  {
    family: "TON",
    transport: "Text comment on a minimal self-transfer",
    deployment: null,
  },
  {
    family: "Hedera",
    transport: "Consensus Service message on a registry topic",
    deployment: "HCS topic",
  },
] as const;

const LIFECYCLE_STEPS = [
  {
    title: "1 · Propose",
    body: "proposeAnchor escrows a FOCAT tip plus a refundable bond and records the CID, the URI, and the originating platform id. Chunk anchors stay free — only the file-level CID enters the protocol.",
  },
  {
    title: "2 · Challenge window",
    body: "For 24 hours (governance-configurable) anyone may challenge with a counter-bond. Most anchors are honest, so most pass through untouched — the optimistic fast path.",
  },
  {
    title: "3 · Verify (fast path)",
    body: "After an unchallenged window, finalization is permissionless. The anchor becomes Verified — first verified wins per CID — the bond returns, and the tip splits 60/25/15.",
  },
  {
    title: "4 · Dispute (slow path)",
    body: "A challenge draws a five-member jury at random from the staked validator set. Majority decides; ties default to the optimistic outcome. Losing bonds and losing jurors are slashed.",
  },
] as const;

const FEE_SPLIT = [
  {
    pct: "60%",
    label: "Validators",
    detail: "pro-rata across active stake, claimed as pull payments",
    bar: "bg-success",
    width: "60%",
  },
  {
    pct: "25%",
    label: "Platform",
    detail: "the registered integrator that originated the anchor",
    bar: "bg-warning",
    width: "25%",
  },
  {
    pct: "15%",
    label: "Protocol",
    detail: "the treasury held by the governance timelock",
    bar: "bg-accent",
    width: "15%",
  },
] as const;

const TOKEN_POINTS = [
  {
    title: "One global supply",
    body: "FOCAT exists natively on every contract runtime — ERC-20 with ERC20Votes on EVM, a Fungible Asset on Aptos, Coin<FOCAT> on Sui, a Cairo ERC-20 on Starknet, NEP-141 on NEAR. The initial supply mints once, on the home chain; every other deployment starts at zero and receives FOCAT exclusively through bridges.",
  },
  {
    title: "Bridged by governance, not by vendor",
    body: "Supply moves by burn on the source chain and mint on the destination, through bridges governance explicitly approves. On EVM the token implements ERC-7802 with per-bridge mint/burn rate limits that replenish linearly over one day — the blast-radius cap if a bridge is compromised.",
  },
  {
    title: "Most users never touch it",
    body: "Signing in and paying with USD credits lets the hosted worker hold the FOCAT and anchor on the user's behalf. Wallet anchoring offers a fixed-price anchor pack — enough for one propose, delivered to the connected wallet. A verification fee, not a trading desk.",
  },
  {
    title: "Validators earn rather than buy",
    body: "The 60% tip share plus slashed bonds from lost disputes flow to validators continuously; a starter pack exists purely for bootstrapping. Testnets are faucet-only, never mixed with any mainnet distribution.",
  },
] as const;

const LIMITATIONS = [
  "Anchoring proves existence and integrity, not authorship or truthfulness — the market backs the claim's well-formedness and attribution, it does not fact-check file contents.",
  "Jury randomness is chain-dependent in v1: native randomness on Aptos and Sui; prevrandao + parent blockhash on EVM (sequencer-influenceable on most L2s); a two-step block-hash draw on Starknet (the weakest); the block producer's random_seed on NEAR.",
  "Jury votes are public — no commit-reveal — and non-voting jurors are not slashed.",
  "Platform registration is governance-gated rather than permissionless in v1.",
  "Validator stake is not delegatable, and juries are uniform rather than stake-weighted.",
  "The non-EVM governance mirror is a trust seam: parameter changes there are only as trustworthy as the admin's fidelity to EVM outcomes. Bridge rate limits are EVM-only in v1.",
  "Cache nodes are availability, not custody: private-cache nodes hold ciphertext only, and losing the client-held key means losing access — by design.",
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

const Prose = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm leading-relaxed text-muted md:text-base">{children}</p>
);

const FieldTable = ({
  rows,
}: {
  rows: readonly { field: string; type: string; meaning: string }[];
}) => (
  <div className="overflow-x-auto rounded-lg border border-border">
    <table className="w-full min-w-[560px] text-left text-sm">
      <thead>
        <tr className="border-b border-border bg-surface-elevated/60">
          {["Field", "Type", "Meaning"].map((h) => (
            <th
              key={h}
              className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.field} className="border-b border-border last:border-b-0">
            <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-foreground">
              {row.field}
            </td>
            <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted">
              {row.type}
            </td>
            <td className="px-4 py-3 text-muted">{row.meaning}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/**
 * /whitepaper — the protocol white paper as indexable HTML. Server component
 * on purpose: pure static prose, zero client JS. The canonical markdown
 * version lives at docs/whitepaper.md in the repository; keep the two in
 * sync when the protocol design changes.
 */
const WhitepaperPage = () => (
  <PageShell size="default" padding="lg" atmosphere>
    <PageHeader
      className="mb-6"
      index="08"
      kicker="White paper · v1.0 · July 2026"
      title="A chain-agnostic protocol for permanent, verifiable file anchoring."
      lede="One anchor payload across twelve chain families, an optimistic propose/verify market backed by the FOCAT token, EVM-hubbed governance, and storage deliberately decoupled from proof."
      actions={
        <a
          href={WHITEPAPER_MD}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-border bg-surface px-4 py-2 text-xs font-medium text-foreground transition-colors duration-base hover:border-primary/40 hover:text-primary"
        >
          Markdown version ↗
        </a>
      }
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
      <section id="abstract" className="scroll-mt-24 space-y-4">
        <SectionHeading id="abstract-heading">Abstract</SectionHeading>
        <Prose>
          FileOnChain is an open protocol for anchoring the existence and
          integrity of files on public blockchains. A file is reduced to a
          content identifier (CID) — a self-verifying hash of its bytes — and
          that CID is written into a transaction on any of{" "}
          {CHAIN_FAMILIES.length} chain families, from EVM and Substrate to
          Cardano, TON, and Hedera, using one versioned payload vocabulary that
          any indexer can read back regardless of chain. On chains with
          smart-contract runtimes, anchors graduate from simple timestamps to{" "}
          <em>verified claims</em> through an optimistic verification market: a
          proposer escrows a token tip and bond, the claim survives a 24-hour
          challenge window policed by staked validators, and the tip is split
          between the validators who secure the market, the platform that
          originated the anchor, and a community-governed treasury.
        </Prose>
        <Prose>
          Storage of the bytes themselves is deliberately decoupled from
          anchoring and served by an encrypted paid cache and a donation-funded
          public cache. The entire stack — contracts on five runtimes, twelve
          TypeScript anchor clients, a hosted API, and an MCP server for AI
          agents — is open source under the MIT license.
        </Prose>
      </section>

      {/* ------------------------------------------------------------ */}
      <section id="motivation" className="scroll-mt-24 space-y-4">
        <SectionHeading id="motivation-heading">1 · Motivation</SectionHeading>
        <Prose>
          The web forgets. Links rot, platforms shut down, files are silently
          edited, and there is rarely a way to prove that a document existed in
          a particular form at a particular time. Public blockchains solve
          exactly this — durable, timestamped, tamper-evident records — yet
          using them for files remains fragmented:
        </Prose>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted md:text-base">
          <li>
            <span className="font-medium text-foreground">Every chain is a silo.</span>{" "}
            An anchor written on Ethereum is invisible to tooling built for
            Solana; each ecosystem reinvents its own ad-hoc format for
            &ldquo;this hash existed.&rdquo;
          </li>
          <li>
            <span className="font-medium text-foreground">Anchors are unverified.</span>{" "}
            A transaction proves <em>someone wrote a hash at a time</em> — it
            says nothing about whether the anchor is well-formed, attributable,
            or worth trusting. No economic layer puts skin in the game behind a
            claim.
          </li>
          <li>
            <span className="font-medium text-foreground">
              Storage and proof are conflated.
            </span>{" "}
            Fully on-chain storage is prohibitively expensive on most networks,
            while off-chain storage without an on-chain commitment proves
            nothing. The two concerns need a clean seam, not a bundle.
          </li>
        </ul>
        <Prose>
          FileOnChain addresses all three: one anchor vocabulary that works
          identically across {CHAIN_FAMILIES.length} chain families, an
          optimistic verification protocol that turns anchors into economically
          backed claims on contract-capable chains, and byte storage kept
          separate — content addressing makes files reconstructible and
          verifiable from any host, so no canonical host needs to exist.
        </Prose>
      </section>

      {/* ------------------------------------------------------------ */}
      <section id="principles" className="scroll-mt-24 space-y-6">
        <SectionHeading id="principles-heading">2 · Design principles</SectionHeading>
        <div className="grid gap-4 md:grid-cols-2">
          {PRINCIPLES.map((p) => (
            <Card key={p.title}>
              <CardTitle>{p.title}</CardTitle>
              <CardDescription className="mt-2 leading-relaxed">{p.body}</CardDescription>
            </Card>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ */}
      <section id="system" className="scroll-mt-24 space-y-6">
        <SectionHeading id="system-heading">3 · System overview</SectionHeading>

        <h3 className="text-lg font-semibold text-foreground">
          3.1 Content addressing and chunking
        </h3>
        <Prose>
          A file — or a folder, which anchors exactly like a file via the CID
          of its DAG root — is processed client-side: the bytes are split into
          64&nbsp;KiB chunks, each chunk is hashed with SHA-256 and encoded as
          a CIDv1, and chunk CIDs are linked into a forward-chained sequence in
          which each chunk anchor names the CID of the next. Hashing happens in
          the browser or the caller&apos;s own process; the raw bytes never
          need to leave the uploader&apos;s machine for an anchor to be
          created.
        </Prose>

        <h3 className="text-lg font-semibold text-foreground">3.2 The anchor payload</h3>
        <Prose>
          Every anchor, on every chain, is the same versioned JSON document,
          identified by the protocol tag{" "}
          <code className="font-mono text-xs">p: &quot;fileonchain&quot;</code> and
          version <code className="font-mono text-xs">v: 1</code>. The
          file-level anchor — one per file or folder DAG root:
        </Prose>
        <FieldTable rows={FILE_PAYLOAD_FIELDS} />
        <Prose>The chunk-level anchor — one per 64&nbsp;KiB chunk:</Prose>
        <FieldTable rows={CHUNK_PAYLOAD_FIELDS} />
        <Prose>
          Two properties follow. First,{" "}
          <span className="font-medium text-foreground">one indexer reads every chain</span>:
          the payload decodes identically whether it was found in an EVM event,
          a Substrate remark, a Solana memo, Cardano transaction metadata, or a
          Hedera consensus message. Second,{" "}
          <span className="font-medium text-foreground">
            attribution travels with the payload
          </span>
          : the <code className="font-mono text-xs">pid</code> field carries
          the originating platform on every family — including memo-only chains
          with no contract to enforce it.
        </Prose>

        <h3 className="text-lg font-semibold text-foreground">3.3 Anchoring order</h3>
        <Prose>
          Chunk anchors are always written first and the file-level anchor
          last. Indexers rely on this ordering: when a file-level anchor
          appears, its chunk trail is already complete, so the file record can
          be finalized in a single pass.
        </Prose>
      </section>

      {/* ------------------------------------------------------------ */}
      <section id="chains" className="scroll-mt-24 space-y-6">
        <SectionHeading id="chains-heading">
          4 · Chain families and transports
        </SectionHeading>
        <Prose>
          FileOnChain v1 spans {CHAIN_FAMILIES.length} chain families —{" "}
          {MAINNET_CHAINS.length + TESTNET_CHAINS.length} registered networks (
          {MAINNET_CHAINS.length} mainnets and {TESTNET_CHAINS.length}{" "}
          testnets). Each family anchors through the most native channel its
          runtime offers:
        </Prose>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-elevated/60">
                {["Family", "Transport", "Deployment required"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TRANSPORT_ROWS.map((row) => (
                <tr key={row.family} className="border-b border-border last:border-b-0">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                    {row.family}
                  </td>
                  <td className="px-4 py-3 text-muted">{row.transport}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {row.deployment ? (
                      <span className="text-muted">{row.deployment}</span>
                    ) : (
                      <Badge variant="success" size="sm">
                        none — native channel
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Prose>
          The chain registry (
          <code className="font-mono text-xs">packages/utils/src/chains.ts</code>
          ) is the protocol&apos;s single source of truth: every network entry
          carries its RPC endpoints, explorer URL templates, deployed
          contract/module/program/topic identifiers, and a rollout status. A
          chain is <span className="font-medium text-foreground">provisioned</span>{" "}
          when its entry carries a live deployment (or needs none); anchoring
          against an unprovisioned chain fails fast with a typed error so
          callers can fall back or choose another network. Sui and Starknet
          batch all of a file&apos;s anchors into a single programmable
          transaction block or multicall — one signature for the whole file;
          the memo, metadata, and comment families send one payload per
          transaction with pre-flight size validation.
        </Prose>
      </section>

      {/* ------------------------------------------------------------ */}
      <section id="protocol" className="scroll-mt-24 space-y-6">
        <SectionHeading id="protocol-heading">
          5 · The optimistic anchor protocol
        </SectionHeading>
        <Prose>
          On contract-capable runtimes (EVM, Aptos, Sui, Starknet, NEAR),
          file-level anchors are upgraded from timestamps to verified claims
          through a propose/verify market denominated in the protocol token,
          FOCAT. Four roles interact: the{" "}
          <span className="font-medium text-foreground">proposer</span> escrows
          a tip plus a refundable bond;{" "}
          <span className="font-medium text-foreground">validators</span> stake
          FOCAT above a governance-set minimum to earn tip shares and serve on
          juries (unbonding stays slashable through a cooldown);{" "}
          <span className="font-medium text-foreground">platforms</span> —
          registered integrators, FileOnChain itself being platform 1 — earn
          the platform share on anchors they originate; and{" "}
          <span className="font-medium text-foreground">challengers</span> post
          counter-bonds to open disputes.
        </Prose>
        <div className="grid gap-4 md:grid-cols-2">
          {LIFECYCLE_STEPS.map((step) => (
            <Card key={step.title}>
              <CardTitle>{step.title}</CardTitle>
              <CardDescription className="mt-2 leading-relaxed">{step.body}</CardDescription>
            </Card>
          ))}
        </div>
        <Prose>
          Verification settles per file, per chain: the same CID can be
          anchored — and independently verified — on any number of chains, and
          the record on each remains readable by anyone, wallet-free.
        </Prose>

        <h3 className="text-lg font-semibold text-foreground">The fee split</h3>
        <Card className="p-5">
          <div className="flex h-4 w-full overflow-hidden rounded-full" aria-hidden>
            {FEE_SPLIT.map((s) => (
              <div key={s.label} className={s.bar} style={{ width: s.width }} />
            ))}
          </div>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            {FEE_SPLIT.map((s) => (
              <p key={s.label}>
                <span className="font-medium">
                  {s.pct} {s.label.toLowerCase()}
                </span>
                <span className="block text-muted">{s.detail}</span>
              </p>
            ))}
          </div>
        </Card>
        <Prose>
          The split aligns the three parties the market needs: validators are
          paid to stake and police claims, integrators are paid to bring
          anchors into the protocol, and the treasury funds whatever FOCAT
          holders vote for. The protocol ships as a small contract suite
          deployed together on every runtime — FOCAT, FileRegistry,
          ValidatorStaking, PlatformRegistry, Governor + Timelock on EVM, and
          the adjacent CachePayments and DonationEscrow — detailed on the{" "}
          <Link href="/protocol" className="text-primary underline underline-offset-2">
            protocol page
          </Link>
          .
        </Prose>
      </section>

      {/* ------------------------------------------------------------ */}
      <section id="token" className="scroll-mt-24 space-y-6">
        <SectionHeading id="token-heading">6 · The FOCAT token</SectionHeading>
        <Prose>
          FOCAT (FileOnChain Attestation Token) is the unit of account of the
          verification market: tips, bonds, validator stakes, and — on EVM —
          governance votes. It is designed to stay out of the user&apos;s way.
        </Prose>
        <div className="grid gap-4 md:grid-cols-2">
          {TOKEN_POINTS.map((point) => (
            <Card key={point.title}>
              <CardTitle>{point.title}</CardTitle>
              <CardDescription className="mt-2 leading-relaxed">{point.body}</CardDescription>
            </Card>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ */}
      <section id="governance" className="scroll-mt-24 space-y-4">
        <SectionHeading id="governance-heading">7 · Governance</SectionHeading>
        <Prose>
          Protocol governance lives on EVM as an OpenZeppelin
          Governor + Timelock pair: FOCAT holders vote (deploy-time defaults of
          a 1-day voting delay, 1-week voting period, 100,000-FOCAT proposal
          threshold, and 4% quorum), and passed proposals execute through a
          timelock with a 2-day minimum delay. The timelock owns everything —
          every parameter setter, the protocol treasury the 15% tip share
          accrues to, and each contract&apos;s proxy admin — so a parameter
          change, a treasury spend, and a contract upgrade are all the same
          motion. The deployer renounces its timelock admin role at the end of
          the deployment run.
        </Prose>
        <Prose>
          Governance sets protocol rules, never per-file outcomes: fee-split
          basis points, platform fee caps and registration, bond sizes, minimum
          tips, window durations, jury size and slash amounts, validator stake
          minimums, and treasury spends. Whether an individual CID verifies is
          decided by the optimistic window and, on dispute, a staked jury — not
          by token votes.
        </Prose>
        <Prose>
          Aptos, Sui, Starknet, and NEAR run the same protocol — same
          lifecycle, same split, same defaults — but do not port the Governor.
          Each keeps its parameters behind an admin that executes EVM
          governance decisions by replaying the equivalent setter; every
          registry exposes the same setter vocabulary, so decisions map
          one-to-one. This is a trust seam by design in v1, hardening toward a
          multisig and eventually a cross-chain message executor. On EVM every
          protocol contract sits behind a transparent upgradeable proxy owned
          by the timelock; the Governor and Timelock themselves are
          deliberately not proxied — the timelock is the root of trust. Full
          details live in the{" "}
          <a
            href={`${GITHUB_REPO}/blob/main/docs/governance.md`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2"
          >
            governance specification
          </a>
          .
        </Prose>
      </section>

      {/* ------------------------------------------------------------ */}
      <section id="storage" className="scroll-mt-24 space-y-4">
        <SectionHeading id="storage-heading">
          8 · Storage: anchoring proves, caching serves
        </SectionHeading>
        <Prose>
          An anchor commits to a file&apos;s content; it does not store the
          bytes (except on data-carrying chains such as Autonomys, where chunk
          bytes ride along in the anchor itself). Because CIDs are
          content-addressed, the bytes can be rebuilt and verified from any
          host — so availability is a market with two tiers rather than a
          promise.
        </Prose>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardTitle>Private cache — paid</CardTitle>
            <CardDescription className="mt-2 leading-relaxed">
              Chunks are encrypted client-side with a key only the uploader
              (and their sharees) hold; cache nodes store ciphertext for the
              duration paid and never see plaintext. Payments settle in USDC
              through the CachePayments contract.
            </CardDescription>
          </Card>
          <Card>
            <CardTitle>Public cache — donation-funded</CardTitle>
            <CardDescription className="mt-2 leading-relaxed">
              A free, slow-tier pin for public goods — research data, archives,
              open-source releases. Donations in the chain&apos;s native coin
              route through the DonationEscrow contract to cache node
              operators.
            </CardDescription>
          </Card>
        </div>
        <Prose>
          Neither tier is required for an anchor&apos;s validity, and no
          canonical host exists: anyone holding bytes that hash to the anchored
          CID holds the file.
        </Prose>
      </section>

      {/* ------------------------------------------------------------ */}
      <section id="access" className="scroll-mt-24 space-y-6">
        <SectionHeading id="access-heading">9 · Access paths</SectionHeading>
        <Prose>
          Everything on fileonchain.org runs on the same open-source packages
          anyone can use:
        </Prose>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardTitle>The webapp</CardTitle>
            <CardDescription className="mt-2 leading-relaxed">
              Wallet-signed, pay-as-you-go anchoring across all twelve
              families, an explorer over anchored CIDs, cache payments,
              donations, and a credits-based dashboard.
            </CardDescription>
          </Card>
          <Card>
            <CardTitle className="font-mono text-sm">@fileonchain/sdk</CardTitle>
            <CardDescription className="mt-2 leading-relaxed">
              The umbrella TypeScript SDK: chain registry and payload
              vocabulary at the root, one anchor client per family behind
              subpaths, all sharing one progress and receipt shape. Nine of
              twelve clients are fully dependency-free.
            </CardDescription>
          </Card>
          <Card>
            <CardTitle className="font-mono text-sm">@fileonchain/api</CardTitle>
            <CardDescription className="mt-2 leading-relaxed">
              A zero-dependency client for the hosted API: FileOnChain&apos;s
              workers sign and send, paid with account credits under fok_ API
              keys. On-chain failures refund credits.
            </CardDescription>
          </Card>
          <Card>
            <CardTitle className="font-mono text-sm">@fileonchain/mcp</CardTitle>
            <CardDescription className="mt-2 leading-relaxed">
              A Model Context Protocol server exposing registry lookups, CID
              validation, and API-backed anchoring as tools, so AI agents can
              anchor files without holding private keys.
            </CardDescription>
          </Card>
        </div>
        <Prose>
          The{" "}
          <Link href="/docs" className="text-primary underline underline-offset-2">
            SDK documentation
          </Link>{" "}
          covers all four in depth.
        </Prose>
      </section>

      {/* ------------------------------------------------------------ */}
      <section id="security" className="scroll-mt-24 space-y-4">
        <SectionHeading id="security-heading">
          10 · Security considerations and known limitations
        </SectionHeading>
        <Prose>Design choices and their trade-offs, stated plainly:</Prose>
        <ul className="space-y-2 text-sm leading-relaxed text-muted md:text-base">
          {LIMITATIONS.map((point) => (
            <li key={point} className="flex gap-2">
              <span
                aria-hidden
                className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
              />
              {point}
            </li>
          ))}
        </ul>
        <Prose>
          Each limitation has a documented follow-up path; the contracts target
          ≥95% test coverage per runtime.
        </Prose>
      </section>

      {/* ------------------------------------------------------------ */}
      <section id="status" className="scroll-mt-24 space-y-4">
        <SectionHeading id="status-heading">11 · Implementation status</SectionHeading>
        <Prose>
          FileOnChain ships honestly: anchoring is real wherever a chain is
          provisioned, and the registry&apos;s provisioning flags — not
          marketing copy — are the switch. The anchor payload vocabulary, all
          twelve family clients, the contract suites for the five contract
          runtimes, the hosted API, and the MCP server are built and open
          source. Per-chain rollout is tracked in the chain registry: each
          network flips to real anchoring when its contracts, modules, topics,
          or native channels are deployed, recorded, and QA&apos;d. Surfaces
          not yet wired to live deployments run against a clearly marked
          deterministic mock layer whose call signatures match the real
          integrations, so the seams swap without breaking callers.
        </Prose>
      </section>

      {/* ------------------------------------------------------------ */}
      <section id="conclusion" className="scroll-mt-24 space-y-4">
        <SectionHeading id="conclusion-heading">12 · Conclusion</SectionHeading>
        <Prose>
          FileOnChain turns &ldquo;this file existed&rdquo; into a portable,
          verifiable, economically backed on-chain fact. One payload vocabulary
          makes anchors readable across twelve chain families; an optimistic
          propose/verify market makes them trustworthy on contract-capable
          chains; a token with one global, governance-bridged supply pays the
          validators, platforms, and treasury that keep the market honest; and
          content addressing keeps storage a competitive service rather than a
          point of failure. The protocol is deliberately minimal at its core —
          a JSON document and a hash — and deliberately honest at its edges,
          shipping real anchoring chain by chain as deployments land.
        </Prose>
      </section>
    </div>

    {/* Footer note */}
    <section className="mt-16 rounded-2xl border border-dashed border-border bg-surface/60 p-5 text-sm text-muted">
      <p>
        FileOnChain is open source under the MIT license. This page describes
        protocol version 1; the values shown are deploy-time defaults that
        governance can revise. The canonical markdown version of this document
        lives{" "}
        <a
          href={WHITEPAPER_MD}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
        >
          in the repository
        </a>
        , and the{" "}
        <Link
          href="/protocol"
          className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
        >
          protocol page
        </Link>{" "}
        tracks the live verification market.
      </p>
    </section>
  </PageShell>
);

export default WhitepaperPage;
