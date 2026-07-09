import * as React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import Badge from "@/components/ui/Badge";
import { CHAIN_FAMILIES, MAINNET_CHAINS, TESTNET_CHAINS } from "@fileonchain/sdk";

export const metadata: Metadata = {
  title: "White Paper",
  description:
    "The FileOnChain white paper: files stored on-chain by default, one payload vocabulary across twelve chain families, fileonchain:// pointers from proofs to bytes, an optimistic verification market backed by FOCAT, and EVM-hubbed governance.",
  alternates: { canonical: "/whitepaper" },
  openGraph: {
    title: "White Paper · FileOnChain",
    description:
      "Permanent on-chain file storage with cross-chain proofs — the storage model, the verification market, the FOCAT token, and governance.",
    url: "/whitepaper",
    type: "article",
  },
  // Without this, the root layout's twitter block (homepage copy) is
  // inherited wholesale — metadata merges shallowly per top-level key.
  twitter: {
    card: "summary_large_image",
    title: "White Paper · FileOnChain",
    description:
      "Permanent on-chain file storage with cross-chain proofs — the storage model, the verification market, the FOCAT token, and governance.",
  },
};

const GITHUB_REPO = "https://github.com/FileOnchain/fileonchain-org";
const WHITEPAPER_MD = `${GITHUB_REPO}/blob/main/docs/whitepaper.md`;

/* ------------------------------------------------------------------ */
/* Document structure — the paper eats its own dogfood: sections 0–11  */
/* are its "chunks", and the conclusion is the file-level anchor,      */
/* written last, exactly as the protocol orders real uploads.          */
/* ------------------------------------------------------------------ */

interface DocSection {
  id: string;
  label: string;
}

const CHUNK_SECTIONS: DocSection[] = [
  { id: "abstract", label: "Abstract" },
  { id: "motivation", label: "Motivation" },
  { id: "principles", label: "Design principles" },
  { id: "system", label: "System overview" },
  { id: "chains", label: "Chains & storage budgets" },
  { id: "protocol", label: "The anchor protocol" },
  { id: "token", label: "The FOCAT token" },
  { id: "governance", label: "Governance" },
  { id: "retrieval", label: "Retrieval & caches" },
  { id: "access", label: "Access paths" },
  { id: "security", label: "Security & limitations" },
  { id: "status", label: "Implementation status" },
];

const ANCHOR_SECTION: DocSection = { id: "conclusion", label: "Conclusion" };

const CHUNK_TOTAL = CHUNK_SECTIONS.length;

const chunkIndexOf = (id: string): number =>
  CHUNK_SECTIONS.findIndex((s) => s.id === id);

const pad2 = (n: number): string => String(n).padStart(2, "0");

/* ------------------------------------------------------------------ */
/* Reference data                                                      */
/* ------------------------------------------------------------------ */

const PRINCIPLES = [
  {
    title: "The chain is the storage medium",
    body: "By default the file's bytes are written into the chain's own history — no pinning service, no canonical host, no company that can turn it off. Retrieval needs nothing but a node (or archive) of the storage chain.",
  },
  {
    title: "The user picks where bytes live",
    body: "Any storage-capable chain can be the file's home. The anchoring chain is the default; Autonomys — purpose-built for permanent data storage — is the suggested home for medium and large files, where it is cheapest. Users who already host bytes elsewhere opt out and link their copy instead.",
  },
  {
    title: "Content addressing over location addressing",
    body: "Files are identified by CIDv1 hashes — valid forever, verifiable by anyone holding the bytes, wherever they were found.",
  },
  {
    title: "Chain-agnostic by construction",
    body: "The payload written on-chain is byte-identical on every family. Chains differ only in the transaction envelope — a contract call, a remark, a memo, metadata, or a consensus message — and in how many bytes one transaction can carry.",
  },
  {
    title: "Optimistic verification",
    body: "Most anchors are honest, so the fast path is cheap: propose, wait out a challenge window, finalize. Disputes are the expensive exception, resolved by staked-validator juries.",
  },
  {
    title: "Open everything",
    body: "Contracts, SDKs, the webapp, the API surface, and this document are MIT-licensed and developed in the open.",
  },
] as const;

const CHUNK_PAYLOAD_FIELDS = [
  { field: "p", type: '"fileonchain"', meaning: "Protocol tag" },
  { field: "v", type: "1", meaning: "Payload version" },
  { field: "op", type: '"chunk"', meaning: "Operation" },
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
    meaning: "The chunk's bytes (base64) — present on the storage chain",
  },
] as const;

const FILE_PAYLOAD_FIELDS = [
  { field: "op", type: '"anchor"', meaning: "Operation (p and v as above)" },
  { field: "cid", type: "string", meaning: "CIDv1 of the file or folder DAG root" },
  { field: "sha256", type: "string · optional", meaning: "SHA-256 (hex) of the raw content" },
  {
    field: "uri",
    type: "string · optional",
    meaning: "Where the bytes live (storage URI or external pointer)",
  },
  {
    field: "pid",
    type: "string · optional",
    meaning: "Originating platform id (integrator attribution)",
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
    transport: "system.remarkWithEvent batched via utility.batchAll",
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

/** Raw bytes per transaction, for the log-scale bar (64 B … 64 KiB). */
const STORAGE_BUDGET_ROWS = [
  {
    family: "Substrate (Autonomys)",
    bytes: 65536,
    budget: "64 KiB",
    character:
      "Suggested home — permanent-storage network, embeds bytes by default, cheapest for large files",
    suggested: true,
  },
  {
    family: "EVM",
    bytes: 65536,
    budget: "64 KiB",
    character:
      "Calldata storage; costs scale with gas price — practical on L2s, expensive on Ethereum L1",
    suggested: false,
  },
  { family: "NEAR", bytes: 48896, budget: "~48 KiB", character: "Function-call args", suggested: false },
  { family: "Aptos", bytes: 36608, budget: "~36 KiB", character: "Entry-function arg", suggested: false },
  { family: "Starknet", bytes: 24320, budget: "~24 KiB", character: "ByteArray calldata", suggested: false },
  { family: "Sui", bytes: 12032, budget: "~12 KiB", character: "PTB pure argument", suggested: false },
  { family: "Cardano", bytes: 5888, budget: "~5.8 KiB", character: "CIP-20 metadata", suggested: false },
  { family: "TRON", bytes: 1280, budget: "~1.3 KiB", character: "Memo field", suggested: false },
  { family: "Hedera", bytes: 512, budget: "512 B", character: "One HCS message per chunk", suggested: false },
  { family: "TON", bytes: 448, budget: "448 B", character: "Transfer comment", suggested: false },
  {
    family: "Solana",
    bytes: 256,
    budget: "256 B",
    character: "Memo — viable for very small files only",
    suggested: false,
  },
  {
    family: "Cosmos",
    bytes: null,
    budget: "—",
    character: "Memos (256 B default) can't fit the envelope plus data: anchor-only",
    suggested: false,
  },
] as const;

/** Log-scale width for the budget bar: 64 B → ~0%, 64 KiB → 100%. */
const budgetBarWidth = (bytes: number | null): string => {
  if (bytes === null) return "0%";
  const pct = (Math.log2(bytes / 64) / Math.log2(65536 / 64)) * 100;
  return `${Math.max(3, Math.round(pct))}%`;
};

const LIFECYCLE_STEPS = [
  {
    title: "1 · Propose",
    body: "proposeAnchor escrows a FOCAT tip plus a refundable bond and records the CID, the storage URI, and the originating platform id. Chunk anchors — including the data-carrying ones — stay free; only the file-level CID enters the paid protocol.",
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
  "On-chain bytes are public and permanent. Anything stored unencrypted is world-readable forever — that is the point, and also the warning. Sensitive content belongs in the encrypted private cache, or encrypted client-side before storage.",
  "Data durability equals the storage chain's history retention. On a purpose-built storage network (Autonomys) archival is the protocol; on general-purpose chains, embedded bytes live in transaction history (e.g. EVM calldata), whose long-term availability depends on archive nodes.",
  "Small-budget chains make storage possible, not economical — a 1 MB file is ~16 transactions on Autonomys and ~2,000 on Hedera. The uploader surfaces transaction counts and costs before signing.",
  "Anchoring proves existence and integrity, not authorship or truthfulness — the market backs the claim's well-formedness and attribution, it does not fact-check file contents.",
  "Jury randomness is chain-dependent in v1: native randomness on Aptos and Sui; prevrandao + parent blockhash on EVM (sequencer-influenceable on most L2s); a two-step block-hash draw on Starknet (the weakest); the block producer's random_seed on NEAR.",
  "Jury votes are public — no commit-reveal — and non-voting jurors are not slashed. Platform registration is governance-gated rather than permissionless in v1. Validator stake is not delegatable, and juries are uniform rather than stake-weighted.",
  "The non-EVM governance mirror is a trust seam: parameter changes there are only as trustworthy as the admin's fidelity to EVM outcomes. Bridge rate limits are EVM-only in v1.",
] as const;

/* ------------------------------------------------------------------ */
/* Local layout helpers                                                */
/* ------------------------------------------------------------------ */

/**
 * Section — one "chunk" of the document. The mono marginalia above each
 * serif heading mirrors the protocol's chunk payload (`idx / total`, with
 * the conclusion as the file-level anchor written last), so the paper's
 * own structure demonstrates the ordering rule it specifies.
 */
const Section = ({
  id,
  title,
  anchor = false,
  children,
}: {
  id: string;
  title: string;
  anchor?: boolean;
  children: React.ReactNode;
}) => {
  const idx = chunkIndexOf(id);
  return (
    <section id={id} className="scroll-mt-28">
      <div className="flex items-baseline gap-3">
        <span
          className={
            anchor
              ? "font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-accent"
              : "font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary"
          }
        >
          {anchor ? "anchor · written last" : `chunk ${pad2(idx)} / ${CHUNK_TOTAL}`}
        </span>
        <span aria-hidden className="hairline min-w-8 flex-1 opacity-50" />
      </div>
      <h2 className="font-display mt-3 text-3xl leading-tight text-foreground md:text-4xl">
        {title}
      </h2>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
};

const Prose = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[15px] leading-[1.75] text-muted md:text-base">{children}</p>
);

/** Bordered definition card — quieter than a full Card, keyed for grids. */
const Point = ({ title, body }: { title: string; body: string }) => (
  <div className="rounded-lg border border-border bg-surface p-4 md:p-5">
    <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
  </div>
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
              className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.field} className="border-b border-border last:border-b-0">
            <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-foreground">
              {row.field}
            </td>
            <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted">
              {row.type}
            </td>
            <td className="px-4 py-2.5 text-muted">{row.meaning}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/** One chunk-index entry — shared by the rail and the mobile grid. */
const IndexEntry = ({
  section,
  idx,
  anchor = false,
}: {
  section: DocSection;
  idx?: number;
  anchor?: boolean;
}) => (
  <a
    href={`#${section.id}`}
    className="group flex items-baseline gap-2.5 rounded-sm py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
  >
    <span
      className={
        anchor
          ? "font-mono text-[10px] font-semibold tabular-nums text-accent"
          : "font-mono text-[10px] font-semibold tabular-nums text-primary/70 group-hover:text-primary"
      }
    >
      {anchor ? "◆" : pad2(idx ?? 0)}
    </span>
    <span
      className={
        anchor
          ? "text-xs font-semibold text-foreground group-hover:text-accent"
          : "text-xs text-muted transition-colors duration-base group-hover:text-foreground"
      }
    >
      {section.label}
    </span>
  </a>
);

/**
 * /whitepaper — the protocol white paper as indexable HTML. Server component
 * on purpose: pure static prose, zero client JS (the chunk-index rail is CSS
 * sticky). The canonical markdown version lives at docs/whitepaper.md in the
 * repository; keep the two in sync when the protocol design changes.
 */
const WhitepaperPage = () => (
  <PageShell size="wide" padding="lg" atmosphere>
    <PageHeader
      className="mb-8"
      index="08"
      kicker="White paper"
      title="Permanent on-chain file storage with cross-chain proofs."
      lede="Files stored on the chain itself — bytes embedded in the anchors, on a storage chain the user picks — and proven on any of twelve chain families, with an optimistic verification market backed by the FOCAT token."
    />

    {/* Document plaque — this paper rendered as the file record it would
        be if uploaded: name, version, chunk count, license, source. */}
    <div className="mb-12 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-surface px-4 py-3 font-mono text-[11px] text-muted">
      <span className="font-semibold text-foreground">docs/whitepaper.md</span>
      <span aria-hidden className="text-border">|</span>
      <span>v1.0 · July 2026</span>
      <span aria-hidden className="text-border">|</span>
      <span>
        {CHUNK_TOTAL} chunks + 1 anchor
      </span>
      <span aria-hidden className="text-border">|</span>
      <span>MIT</span>
      <a
        href={WHITEPAPER_MD}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto font-sans text-xs font-medium text-primary underline-offset-4 hover:underline"
      >
        Markdown source ↗
      </a>
    </div>

    {/* Mobile chunk index — the rail collapses into a two-column grid. */}
    <nav aria-label="Contents" className="mb-12 grid grid-cols-2 gap-x-6 lg:hidden">
      {CHUNK_SECTIONS.map((s, i) => (
        <IndexEntry key={s.id} section={s} idx={i} />
      ))}
      <IndexEntry section={ANCHOR_SECTION} anchor />
    </nav>

    <div className="lg:grid lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-14">
      {/* Chunk-index rail — sections as the document's own chunk trail:
          indexed 00…11, forward-chained, with the conclusion as the
          file-level anchor written last. */}
      <nav
        aria-label="Contents"
        className="sticky top-24 hidden self-start lg:block"
      >
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
          Chunk index
        </p>
        <div className="mt-3 flex flex-col border-l border-border pl-3">
          {CHUNK_SECTIONS.map((s, i) => (
            <IndexEntry key={s.id} section={s} idx={i} />
          ))}
        </div>
        <div className="mt-3 border-l border-accent/50 pl-3">
          <IndexEntry section={ANCHOR_SECTION} anchor />
          <p className="mt-0.5 pl-[22px] font-mono text-[9px] leading-snug text-muted/70">
            file anchor — last, like every upload
          </p>
        </div>
      </nav>

      {/* Document body — readable measure, serif headings. */}
      <article className="max-w-[70ch] space-y-16">
        <Section id="abstract" title="Abstract">
          {/* The abstract opens in the display face — the paper's one
              indulgence, sized for reading rather than show. */}
          <p className="font-display text-xl leading-relaxed text-foreground md:text-2xl">
            FileOnChain is an open protocol for storing files on public
            blockchains and proving them everywhere.
          </p>
          <Prose>
            A file is split into chunks sized to a chain&apos;s per-transaction
            budget, and the chunk bytes themselves are embedded in anchor
            transactions on a <em>storage chain</em> the user chooses — the
            chain they were anchoring on anyway when it can carry data, or
            Autonomys, a permanent-storage network, suggested for anything
            large. The file is then <em>anchored</em> — its content identifier
            (CID) committed with a pointer to the stored copy — on any number
            of the {CHAIN_FAMILIES.length} supported chain families, from EVM
            and Substrate to Cardano, TON, and Hedera, using one versioned
            payload vocabulary that any indexer can read back regardless of
            chain.
          </Prose>
          <Prose>
            On chains with smart-contract runtimes, anchors graduate from
            timestamps to <em>verified claims</em> through an optimistic
            verification market: a proposer escrows a token tip and bond, the
            claim survives a 24-hour challenge window policed by staked
            validators, and the tip is split between the validators who secure
            the market, the platform that originated the anchor, and a
            community-governed treasury. Users who already host their bytes
            elsewhere can opt out of on-chain storage and point their anchors
            at any external location. The entire stack — contracts on five
            runtimes, twelve TypeScript clients, a hosted API, and an MCP
            server for AI agents — is open source under the MIT license.
          </Prose>
        </Section>

        <Section id="motivation" title="Motivation">
          <Prose>
            The web forgets. Links rot, platforms shut down, files are silently
            edited, and there is rarely a way to prove that a document existed
            in a particular form at a particular time — let alone to still{" "}
            <em>retrieve</em> it years later. Public blockchains are the most
            durable, tamper-evident storage medium ever deployed, yet using
            them for files remains fragmented:
          </Prose>
          <ul className="list-disc space-y-2 pl-5 text-[15px] leading-[1.75] text-muted md:text-base">
            <li>
              <span className="font-medium text-foreground">
                Files don&apos;t actually live on chain.
              </span>{" "}
              Most &ldquo;on-chain storage&rdquo; projects write a hash and
              store the bytes somewhere else — a pinning service, a gateway, a
              company server. When that host disappears, the hash proves a file
              existed that nobody can read anymore. A protocol named
              FileOnChain should put the file on the chain.
            </li>
            <li>
              <span className="font-medium text-foreground">Every chain is a silo.</span>{" "}
              Bytes stored via one ecosystem&apos;s conventions are invisible
              to tooling built for another; each chain reinvents its own ad-hoc
              format for both data and proofs.
            </li>
            <li>
              <span className="font-medium text-foreground">Proofs are unverified.</span>{" "}
              A transaction proves <em>someone wrote a hash at a time</em> — it
              says nothing about whether the claim is well-formed,
              attributable, or worth trusting. No economic layer puts skin in
              the game behind it.
            </li>
          </ul>
          <Prose>
            FileOnChain addresses all three: it stores the file on chain by
            default — chunk bytes embedded in the same anchor transactions that
            prove it — defines one payload vocabulary for data and proofs
            across {CHAIN_FAMILIES.length} chain families, and adds an
            optimistic verification protocol that turns anchors into
            economically backed claims on contract-capable chains.
          </Prose>
        </Section>

        <Section id="principles" title="Design principles">
          <div className="grid gap-3 sm:grid-cols-2">
            {PRINCIPLES.map((p) => (
              <Point key={p.title} title={p.title} body={p.body} />
            ))}
          </div>
        </Section>

        <Section id="system" title="System overview">
          <h3 className="pt-2 text-lg font-semibold text-foreground">
            Content addressing and chunking
          </h3>
          <Prose>
            A file — or a folder, handled exactly like a file via the CID of
            its DAG root — is processed client-side: the bytes are split into
            chunks sized to the storage chain&apos;s per-transaction data
            budget (64&nbsp;KiB where the chain allows it, smaller where the
            transport is tighter), each chunk is hashed with SHA-256 and
            encoded as a CIDv1, and chunk CIDs are linked into a
            forward-chained sequence in which each chunk anchor names the CID
            of the next. For proof-only anchors the raw bytes never leave the
            uploader&apos;s machine; for storage the bytes go directly from the
            user&apos;s wallet to the chain.
          </Prose>

          <h3 className="pt-2 text-lg font-semibold text-foreground">The anchor payload</h3>
          <Prose>
            Every anchor — data-carrying or proof-only, on every chain — is the
            same versioned JSON document, identified by the protocol tag{" "}
            <code className="font-mono text-xs">p: &quot;fileonchain&quot;</code>{" "}
            and version <code className="font-mono text-xs">v: 1</code>. The
            chunk-level anchor carries the file&apos;s bytes when the chain is
            the storage home:
          </Prose>
          <FieldTable rows={CHUNK_PAYLOAD_FIELDS} />
          <Prose>The file-level anchor — one per file or folder DAG root:</Prose>
          <FieldTable rows={FILE_PAYLOAD_FIELDS} />
          <Prose>
            Three properties follow. First,{" "}
            <span className="font-medium text-foreground">
              the file is reconstructible from the chain alone
            </span>
            : walking the chunk trail on the storage chain and base64-decoding
            each <code className="font-mono text-xs">d</code> field rebuilds
            the file, and every chunk&apos;s CID verifies its bytes — no
            off-chain index required. Second,{" "}
            <span className="font-medium text-foreground">
              one indexer reads every chain
            </span>
            : the payload decodes identically whether it was found in an EVM
            event, a Substrate remark, a Solana memo, Cardano transaction
            metadata, or a Hedera consensus message. Third,{" "}
            <span className="font-medium text-foreground">
              attribution travels with the payload
            </span>
            : the <code className="font-mono text-xs">pid</code> field carries
            the originating platform on every family.
          </Prose>

          <h3 className="pt-2 text-lg font-semibold text-foreground">
            Storage URIs — proofs point at the bytes
          </h3>
          <Prose>
            When the bytes live on one chain and proofs on others, every
            file-level anchor carries a{" "}
            <code className="font-mono text-xs">uri</code> naming the storage
            home:{" "}
            <code className="font-mono text-xs">
              fileonchain://&lt;chainId&gt;/&lt;fileCid&gt;
            </code>
            . A reader who finds the anchor on, say, Base resolves the URI to
            the storage chain, walks the chunk trail there, and verifies the
            rebuilt bytes against the anchored CID. Users who opted out of
            on-chain storage may set the URI to any external location instead —{" "}
            <code className="font-mono text-xs">ipfs://…</code>, an Auto Drive
            CID, <code className="font-mono text-xs">https://…</code> — or omit
            it entirely for a pure existence proof.
          </Prose>

          <h3 className="pt-2 text-lg font-semibold text-foreground">Anchoring order</h3>
          <Prose>
            Chunk anchors are always written first and the file-level anchor
            last. Indexers rely on this ordering: when a file-level anchor
            appears, its chunk trail — and, on the storage chain, the
            file&apos;s full data — is already on-chain, so the file record can
            be finalized in a single pass. (This document follows its own rule:
            twelve chunks, then the anchor.)
          </Prose>
        </Section>

        <Section id="chains" title="Chains and storage budgets">
          <Prose>
            FileOnChain v1 spans {CHAIN_FAMILIES.length} chain families —{" "}
            {MAINNET_CHAINS.length + TESTNET_CHAINS.length} registered networks
            ({MAINNET_CHAINS.length} mainnets and {TESTNET_CHAINS.length}{" "}
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
                      className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TRANSPORT_ROWS.map((row) => (
                  <tr key={row.family} className="border-b border-border last:border-b-0">
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium text-foreground">
                      {row.family}
                    </td>
                    <td className="px-4 py-2.5 text-muted">{row.transport}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">
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

          <h3 className="pt-2 text-lg font-semibold text-foreground">Storage budgets</h3>
          <Prose>
            Any chain whose transport can carry a meaningful slice of data is a
            valid storage chain — the user picks, guided by per-chain cost
            estimates. After the JSON envelope and base64 inflation, the raw
            bytes one chunk anchor can store are:
          </Prose>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-elevated/60">
                  {["Family", "Raw data per tx", "Storage character"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {STORAGE_BUDGET_ROWS.map((row) => (
                  <tr key={row.family} className="border-b border-border last:border-b-0">
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium text-foreground">
                      {row.family}
                      {row.suggested && (
                        <Badge variant="success" size="sm" className="ml-2">
                          suggested
                        </Badge>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <span className="font-mono text-xs tabular-nums text-foreground">
                        {row.budget}
                      </span>
                      {/* Log-scale magnitude bar — 64 B to 64 KiB. */}
                      <span
                        aria-hidden
                        className="mt-1 block h-1 max-w-[120px] rounded-full bg-border"
                      >
                        <span
                          className="block h-1 rounded-full bg-primary/60"
                          style={{ width: budgetBarWidth(row.bytes) }}
                        />
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted">{row.character}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Prose>
            The uploader derives the chunk size from this budget, so a file
            stored on Autonomys is a handful of 64&nbsp;KiB chunks while the
            same file on Hedera is many 512-byte messages — the interface shows
            the transaction count and cost for every candidate before anything
            is signed. Tiny budgets make storage <em>possible</em> everywhere
            the physics allow, not <em>sensible</em> everywhere: the suggested
            path stores medium and large files on Autonomys and anchors proofs
            wherever the user needs them. The chain registry (
            <code className="font-mono text-xs">packages/utils/src/chains.ts</code>
            ) remains the single source of truth for every network&apos;s
            endpoints, deployments, rollout status, and storage character.
          </Prose>
        </Section>

        <Section id="protocol" title="The optimistic anchor protocol">
          <Prose>
            On contract-capable runtimes (EVM, Aptos, Sui, Starknet, NEAR),
            file-level anchors are upgraded from timestamps to verified claims
            through a propose/verify market denominated in the protocol token,
            FOCAT. Four roles interact: the{" "}
            <span className="font-medium text-foreground">proposer</span>{" "}
            escrows a tip plus a refundable bond;{" "}
            <span className="font-medium text-foreground">validators</span>{" "}
            stake FOCAT above a governance-set minimum to earn tip shares and
            serve on juries (unbonding stays slashable through a cooldown);{" "}
            <span className="font-medium text-foreground">platforms</span> —
            registered integrators, FileOnChain itself being platform 1 — earn
            the platform share on anchors they originate; and{" "}
            <span className="font-medium text-foreground">challengers</span>{" "}
            post counter-bonds to open disputes.
          </Prose>
          <div className="grid gap-3 sm:grid-cols-2">
            {LIFECYCLE_STEPS.map((step) => (
              <Point key={step.title} title={step.title} body={step.body} />
            ))}
          </div>
          <Prose>
            Verification settles per file, per chain: the same CID — stored
            once — can be anchored and independently verified on any number of
            chains, and the record on each remains readable by anyone,
            wallet-free.
          </Prose>

          <h3 className="pt-2 text-lg font-semibold text-foreground">The fee split</h3>
          <div className="rounded-lg border border-border bg-surface p-4 md:p-5">
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
          </div>
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
        </Section>

        <Section id="token" title="The FOCAT token">
          <Prose>
            FOCAT (FileOnChain Attestation Token) is the unit of account of the
            verification market: tips, bonds, validator stakes, and — on EVM —
            governance votes. Storage itself is paid in each chain&apos;s
            native fees; FOCAT prices the <em>verification</em> of the
            file-level claim. It is designed to stay out of the user&apos;s
            way.
          </Prose>
          <div className="grid gap-3 sm:grid-cols-2">
            {TOKEN_POINTS.map((point) => (
              <Point key={point.title} title={point.title} body={point.body} />
            ))}
          </div>
        </Section>

        <Section id="governance" title="Governance">
          <Prose>
            Protocol governance lives on EVM as an OpenZeppelin
            Governor + Timelock pair: FOCAT holders vote (deploy-time defaults
            of a 1-day voting delay, 1-week voting period, 100,000-FOCAT
            proposal threshold, and 4% quorum), and passed proposals execute
            through a timelock with a 2-day minimum delay. The timelock owns
            everything — every parameter setter, the protocol treasury the 15%
            tip share accrues to, and each contract&apos;s proxy admin — so a
            parameter change, a treasury spend, and a contract upgrade are all
            the same motion. The deployer renounces its timelock admin role at
            the end of the deployment run.
          </Prose>
          <Prose>
            Governance sets protocol rules, never per-file outcomes: fee-split
            basis points, platform fee caps and registration, bond sizes,
            minimum tips, window durations, jury size and slash amounts,
            validator stake minimums, and treasury spends. Whether an
            individual CID verifies is decided by the optimistic window and, on
            dispute, a staked jury — not by token votes.
          </Prose>
          <Prose>
            Aptos, Sui, Starknet, and NEAR run the same protocol — same
            lifecycle, same split, same defaults — but do not port the
            Governor. Each keeps its parameters behind an admin that executes
            EVM governance decisions by replaying the equivalent setter; every
            registry exposes the same setter vocabulary, so decisions map
            one-to-one. This is a trust seam by design in v1, hardening toward
            a multisig and eventually a cross-chain message executor. On EVM
            every protocol contract sits behind a transparent upgradeable proxy
            owned by the timelock; the Governor and Timelock themselves are
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
        </Section>

        <Section id="retrieval" title="Retrieval and the cache tiers">
          <Prose>
            The storage chain is the file&apos;s home; the cache tiers exist to
            make retrieval <em>fast</em> and, when wanted, <em>private</em> —
            they accelerate, they never replace.
          </Prose>
          <div className="grid gap-3 sm:grid-cols-2">
            <Point
              title="Straight from the chain"
              body="Anyone can rebuild a stored file from the storage chain's history: walk the chunk trail, decode the data fields, verify against the CIDs. The trust-minimized path — it requires nothing from FileOnChain."
            />
            <Point
              title="Private cache — paid"
              body="Chunks are encrypted client-side with a key only the uploader (and their sharees) hold; cache nodes serve ciphertext at CDN speeds for the duration paid and never see plaintext. Payments settle in USDC through the CachePayments contract."
            />
            <Point
              title="Public cache — donations"
              body="A free pin for public goods — research data, archives, open-source releases. Donations in the chain's native coin route through the DonationEscrow contract to cache node operators."
            />
          </div>
          <Prose>
            Because content addressing verifies bytes wherever they come from,
            a cache node — or any mirror — can vanish without loss: the chain
            still holds the file, and anyone holding bytes that hash to the
            anchored CID holds the file.
          </Prose>
        </Section>

        <Section id="access" title="Access paths">
          <Prose>
            Everything on fileonchain.org runs on the same open-source packages
            anyone can use:
          </Prose>
          <div className="grid gap-3 sm:grid-cols-2">
            <Point
              title="The webapp"
              body="Wallet-signed uploads across all twelve families: pick the storage chain (cost and transaction count shown per candidate), anchor on the chain of your choice, or opt out and link an existing copy — plus an explorer, cache payments, donations, and a credits dashboard."
            />
            <Point
              title="@fileonchain/sdk"
              body="The umbrella TypeScript SDK: chain registry, payload vocabulary, and storage budgets at the root, one client per family behind subpaths — every family's anchorChunkedFile takes an includeData switch for on-chain storage. Nine of twelve clients are fully dependency-free."
            />
            <Point
              title="@fileonchain/api"
              body="A zero-dependency client for the hosted API: FileOnChain's workers sign and send proof anchors, paid with account credits under fok_ API keys. Hosted anchoring never receives file bytes — storage stays wallet-signed (or rides Auto Drive BYOK keys on Autonomys)."
            />
            <Point
              title="@fileonchain/mcp"
              body="A Model Context Protocol server exposing registry lookups, CID validation, and API-backed anchoring as tools, so AI agents can anchor files without holding private keys."
            />
          </div>
          <Prose>
            The{" "}
            <Link href="/docs" className="text-primary underline underline-offset-2">
              SDK documentation
            </Link>{" "}
            covers all four in depth.
          </Prose>
        </Section>

        <Section id="security" title="Security and known limitations">
          <Prose>Design choices and their trade-offs, stated plainly:</Prose>
          <ul className="space-y-2.5 text-[15px] leading-[1.75] text-muted md:text-base">
            {LIMITATIONS.map((point) => (
              <li key={point} className="flex gap-2.5">
                <span
                  aria-hidden
                  className="mt-[0.65em] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                />
                {point}
              </li>
            ))}
          </ul>
          <Prose>
            Each limitation has a documented follow-up path; the contracts
            target ≥95% test coverage per runtime.
          </Prose>
        </Section>

        <Section id="status" title="Implementation status">
          <Prose>
            FileOnChain ships honestly: storage and anchoring are real wherever
            a chain is provisioned, and the registry&apos;s provisioning flags
            — not marketing copy — are the switch. The payload vocabulary
            (including data-carrying chunks), the per-family storage budgets,
            all twelve family clients with the includeData storage switch, the
            contract suites for the five contract runtimes, the hosted API, and
            the MCP server are built and open source. Per-chain rollout is
            tracked in the chain registry: each network flips to real storage
            and anchoring when its contracts, modules, topics, or native
            channels are deployed, recorded, and QA&apos;d. Surfaces not yet
            wired to live deployments run against a clearly marked
            deterministic mock layer whose call signatures match the real
            integrations, so the seams swap without breaking callers.
          </Prose>
        </Section>

        <Section id="conclusion" title="Conclusion" anchor>
          <p className="font-display text-xl leading-relaxed text-foreground md:text-2xl">
            FileOnChain puts the file on the chain — and the proof on every
            chain.
          </p>
          <Prose>
            One payload vocabulary carries both bytes and claims across twelve
            chain families; a user-chosen storage chain, with a
            permanent-storage network as the suggested home, makes the file
            itself retrievable from public infrastructure forever;
            fileonchain:// pointers let a proof on any chain lead back to the
            bytes; and an optimistic propose/verify market, paid in a token
            with one global governance-bridged supply, makes the claims worth
            trusting. The protocol is deliberately minimal at its core — a JSON
            document, a hash, and the bytes themselves — and deliberately
            honest at its edges, shipping real storage chain by chain as
            deployments land.
          </Prose>
        </Section>

        {/* Colophon */}
        <footer className="border-t border-border pt-6">
          <p className="text-sm leading-relaxed text-muted">
            FileOnChain is open source under the MIT license. This page
            describes protocol version 1; the values shown are deploy-time
            defaults that governance can revise. The canonical markdown version
            of this document lives{" "}
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
        </footer>
      </article>
    </div>
  </PageShell>
);

export default WhitepaperPage;
