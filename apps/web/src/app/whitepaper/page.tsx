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
    "The FileOnChain white paper: one developer interface that creates portable, independently verifiable evidence packages across storage and settlement systems — twelve chain families behind one payload vocabulary, optional on-chain storage, and an honestly staged roadmap.",
  alternates: { canonical: "/whitepaper" },
  openGraph: {
    title: "White Paper · FileOnChain",
    description:
      "One developer interface for portable, independently verifiable evidence packages — the payload vocabulary, storage model, audiences, and roadmap.",
    url: "/whitepaper",
    type: "article",
  },
  // Without this, the root layout's twitter block (homepage copy) is
  // inherited wholesale — metadata merges shallowly per top-level key.
  twitter: {
    card: "summary_large_image",
    title: "White Paper · FileOnChain",
    description:
      "One developer interface for portable, independently verifiable evidence packages — the payload vocabulary, storage model, audiences, and roadmap.",
  },
};

const GITHUB_REPO = "https://github.com/FileOnchain/fileonchain-org";
const WHITEPAPER_MD = `${GITHUB_REPO}/blob/main/docs/whitepaper.md`;

/* ------------------------------------------------------------------ */
/* Document structure — the paper eats its own dogfood: the sections   */
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
  { id: "audience", label: "Who it serves" },
  { id: "principles", label: "Design principles" },
  { id: "evidence", label: "The evidence package" },
  { id: "chains", label: "Chains & storage budgets" },
  { id: "retrieval", label: "Retrieval & caches" },
  { id: "access", label: "Access paths" },
  { id: "roadmap", label: "Roadmap — not in v1" },
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

const AUDIENCES = [
  {
    title: "Developers & platform builders — the primary customer",
    body: "A simple API and SDK, not a survey of twelve ecosystems. The interface is one call: hand it bytes or a CID, get back an evidence package. Which chains sit behind that call is configuration, not homework.",
  },
  {
    title: "AI-agent platforms — the primary early use case",
    body: "Tamper-evident action logs and reproducible evidence. The right shape is anchoring the hash of each log segment or decision record as it is produced — not replicating every artifact across chains.",
  },
  {
    title: "Legal & compliance — served through integrators",
    body: "An anchor proves that specific content existed at a specific time, and its integrity since. It does not establish identity, authorship, signatures, retention policy, or admissibility — the evidence package slots into e-signature, identity, and records systems as the integrity layer, never a replacement for them.",
  },
  {
    title: "NFT & media platforms",
    body: "Supported where genuinely-on-chain media is the point of the product. Where a simpler storage option fits, use it — FileOnChain does not pretend to be the cheapest place to put a JPEG.",
  },
  {
    title: "Researchers & archives",
    body: "Long-term preservation and public retrieval are what the donation-funded public cache and the on-chain storage path are for — a public-goods commitment, not a commercial pillar.",
  },
  {
    title: "Ordinary consumers — not the v1 audience",
    body: "Permanent public blockchain storage is the wrong default for personal files; consumers need privacy, recovery, and Dropbox-grade usability. Consumer products may be built on this interface by others.",
  },
] as const;

const PRINCIPLES = [
  {
    title: "One interface, many systems",
    body: "The integrator writes to one SDK/API surface with one payload vocabulary and one receipt shape. Chains are configuration behind it — supporting twelve families is FileOnChain's maintenance burden, never the caller's.",
  },
  {
    title: "Evidence must outlive the service",
    body: "An evidence package is complete in itself: the CID, the payloads, the receipts. Verifying one needs public infrastructure only — a node or explorer of the settlement chain and an open decoding vocabulary — never a FileOnChain endpoint.",
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
    title: "Storage is opt-in, not the point",
    body: "Anchoring proves; storage preserves. The interface stores bytes on-chain when the use case wants it and anchors proof-only when it doesn't — most evidence use cases don't.",
  },
  {
    title: "Ship the narrow thing first",
    body: "v1 contains no token requirement, no staking, no governance vote. Economic layers are roadmap, added only if and where demand proves them out.",
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
    transport: "FileRegistry contract call per chunk + file",
    deployment: "Contract",
  },
  {
    family: "Substrate",
    transport: "system.remarkWithEvent batched via utility.batchAll",
    deployment: null,
  },
  { family: "Solana", transport: "SPL Memo program", deployment: null },
  {
    family: "Aptos",
    transport: "Move module file_registry::anchor_cid",
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
    deployment: "Cairo contract",
  },
  {
    family: "NEAR",
    transport: "anchor_cid on the WASM registry contract",
    deployment: "Rust contract",
  },
  {
    family: "TRON",
    transport: "Transaction data/memo field",
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

const PACKAGE_CONTENTS = [
  {
    title: "The CID",
    body: "A CIDv1 over SHA-256 — recomputable by anyone holding the bytes, valid forever.",
  },
  {
    title: "The anchor payloads",
    body: "The versioned JSON documents written on-chain, byte-identical on every family, decodable with the open vocabulary.",
  },
  {
    title: "The receipts",
    body: "For each settlement system used: chain id, transaction hash(es), and the block and timestamp the chain assigned.",
  },
  {
    title: "Optionally, a storage URI",
    body: "Where the bytes live — a fileonchain:// pointer to an on-chain copy, an external location, or nothing at all for a pure existence proof.",
  },
] as const;

const ROADMAP_ITEMS = [
  {
    title: "A staked verification market",
    body: "File-level anchors could graduate from timestamps to economically backed claims: a proposer escrows a token tip and bond, the claim survives a challenge window, and staked validators earn the tip for policing it.",
  },
  {
    title: "Dispute juries",
    body: "Contested claims resolved by juries drawn from the validator set, with losing bonds and losing jurors slashed.",
  },
  {
    title: "Token bridging",
    body: "A single global token supply moved across runtimes by governance-approved burn/mint bridges (ERC-7802 on EVM).",
  },
  {
    title: "Token governance",
    body: "Parameters, treasury, and upgrades owned by token holders through an on-chain Governor and timelock.",
  },
] as const;

const LIMITATIONS = [
  "Anchoring proves existence and integrity, not authorship or truthfulness. An evidence package shows that specific bytes existed at a specific time and are unchanged — it does not establish who authored them, whether a signature is valid, or whether the contents are true. Identity, signatures, and retention policy belong to the systems layered on top.",
  "On-chain bytes are public and permanent. Anything stored unencrypted is world-readable forever — that is the point, and also the warning. Sensitive content belongs in the encrypted private cache, encrypted client-side before storage — or anchored proof-only, the right default for most evidence use cases.",
  "Data durability equals the storage chain's history retention. On a purpose-built storage network (Autonomys) archival is the protocol; on general-purpose chains, embedded bytes live in transaction history (e.g. EVM calldata), whose long-term availability depends on archive nodes.",
  "Small-budget chains make storage possible, not economical — a 1 MB file is ~16 transactions on Autonomys and ~2,000 on Hedera. The uploader surfaces transaction counts and costs before signing.",
  "Roadmap contracts are previews. The verification-market suite runs on testnets only; its threat model (jury randomness, vote privacy, bridge rate limits) is documented with the roadmap and must be hardened before any mainnet deployment.",
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
      title="One developer interface for portable, independently verifiable evidence packages."
      lede="One SDK, API, and MCP surface that turns a file or record into evidence anyone can verify against public infrastructure — across storage and settlement systems, with the twelve-chain complexity kept behind the interface and the economic layer honestly staged as roadmap."
    />

    {/* Document plaque — this paper rendered as the file record it would
        be if uploaded: name, version, chunk count, license, source. */}
    <div className="mb-12 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-surface px-4 py-3 font-mono text-[11px] text-muted">
      <span className="font-semibold text-foreground">docs/whitepaper.md</span>
      <span aria-hidden className="text-border">|</span>
      <span>v1.1 · July 2026</span>
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
          indexed 00…10, forward-chained, with the conclusion as the
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
            One developer interface that creates portable, independently
            verifiable evidence packages across storage and settlement
            systems.
          </p>
          <Prose>
            FileOnChain is a TypeScript SDK, a hosted API, and an MCP server
            for AI agents that turn a file or record into an{" "}
            <em>evidence package</em>: a portable bundle of its content
            identifier (CID), versioned anchor payloads, and transaction
            receipts on the public settlement systems the caller chooses.
            Anyone holding the package can verify it independently against
            public infrastructure — recompute the CID from the bytes, look up
            the receipts on any node or explorer, decode the payloads with an
            open vocabulary — without trusting FileOnChain or any other
            service. Behind the interface, one payload format is written
            identically across {CHAIN_FAMILIES.length} chain families, from
            EVM and Substrate to Cardano, TON, and Hedera; that breadth is an
            implementation detail the integrator never has to manage.
          </Prose>
          <Prose>
            When the use case genuinely wants the bytes on-chain, the same
            interface embeds chunk data in the anchors on a storage-capable
            chain — Autonomys, a permanent-storage network, is the suggested
            home — while callers who host bytes elsewhere anchor proof-only
            and point at their copy. Version 1 is deliberately narrow: it
            ships anchoring, evidence packages, optional on-chain storage,
            and retrieval — and it does <em>not</em> ship the staked
            validator market, dispute juries, token bridges, or token
            governance, which are documented as a staged roadmap and
            previewed on testnets only. The entire stack is open source under
            the MIT license.
          </Prose>
        </Section>

        <Section id="motivation" title="Motivation">
          <Prose>
            The web forgets, and evidence doesn&apos;t travel. Links rot,
            platforms shut down, files are silently edited, and there is
            rarely a way to prove that a record existed in a particular form
            at a particular time — let alone a way to hand that proof to an
            auditor, a counterparty, or a court and have them check it
            themselves. Public blockchains are the most durable,
            tamper-evident timestamping medium ever deployed, yet using them
            for evidence remains fragmented:
          </Prose>
          <ul className="list-disc space-y-2 pl-5 text-[15px] leading-[1.75] text-muted md:text-base">
            <li>
              <span className="font-medium text-foreground">
                Receipts are not portable.
              </span>{" "}
              A notarization from one service is a row in that service&apos;s
              database, verified through that service&apos;s endpoint. When
              the service changes or disappears, so does the ability to
              verify.
            </li>
            <li>
              <span className="font-medium text-foreground">Every chain is a silo.</span>{" "}
              A hash written via one ecosystem&apos;s conventions is invisible
              to tooling built for another; each chain reinvents its own
              ad-hoc format, and each integration is a new project.
            </li>
            <li>
              <span className="font-medium text-foreground">
                Integration cost lands on the developer.
              </span>{" "}
              Teams that just want &ldquo;tamper-evident proof of this
              record&rdquo; end up evaluating wallets, RPC providers, and
              payload formats per chain — complexity that has nothing to do
              with their product.
            </li>
          </ul>
          <Prose>
            FileOnChain addresses all three with one narrow product: a single
            developer interface that produces evidence packages —
            self-contained, vendor-independent, verifiable by anyone against
            public infrastructure — and one payload vocabulary that makes the
            same evidence readable on every supported settlement system.
          </Prose>
        </Section>

        <Section id="audience" title="Who it serves — and who it does not">
          <Prose>
            Different customers need very different things from
            &ldquo;proof&rdquo;. Version 1 is scoped honestly against those
            needs:
          </Prose>
          <div className="grid gap-3 sm:grid-cols-2">
            {AUDIENCES.map((a) => (
              <Point key={a.title} title={a.title} body={a.body} />
            ))}
          </div>
        </Section>

        <Section id="principles" title="Design principles">
          <div className="grid gap-3 sm:grid-cols-2">
            {PRINCIPLES.map((p) => (
              <Point key={p.title} title={p.title} body={p.body} />
            ))}
          </div>
        </Section>

        <Section id="evidence" title="The evidence package">
          <Prose>
            Producing evidence for a file — or a folder, handled exactly like
            a file via the CID of its DAG root — yields a portable bundle:
          </Prose>
          <div className="grid gap-3 sm:grid-cols-2">
            {PACKAGE_CONTENTS.map((c) => (
              <Point key={c.title} title={c.title} body={c.body} />
            ))}
          </div>
          <Prose>
            Verification is mechanical and needs no permission: recompute the
            CID from the bytes, fetch the referenced transactions from any
            public node or explorer of each chain, decode the payloads with
            the open vocabulary, and check that the CIDs match. The package
            is a file — hand it to whoever needs to check it.
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
            </span>{" "}
            when stored on-chain: walking the chunk trail on the storage chain
            and base64-decoding each <code className="font-mono text-xs">d</code>{" "}
            field rebuilds the file, and every chunk&apos;s CID verifies its
            bytes — no off-chain index required. Second,{" "}
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
            Chunking, for storage
          </h3>
          <Prose>
            When bytes are stored on-chain, the file is processed client-side:
            the bytes are split into chunks sized to the storage chain&apos;s
            per-transaction data budget (64&nbsp;KiB where the chain allows
            it, smaller where the transport is tighter), each chunk is hashed
            with SHA-256 and encoded as a CIDv1, and chunk CIDs are linked
            into a forward-chained sequence in which each chunk anchor names
            the CID of the next. For proof-only anchors the raw bytes never
            leave the caller&apos;s machine; for storage the bytes go directly
            from the user&apos;s wallet to the chain.
          </Prose>

          <h3 className="pt-2 text-lg font-semibold text-foreground">
            Storage URIs — evidence points at the bytes
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
            rebuilt bytes against the anchored CID. Callers who host bytes
            elsewhere set the URI to any external location instead —{" "}
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
            eleven chunks, then the anchor.)
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
            The product <em>is</em> the interface. Everything on
            fileonchain.org runs on the same open-source packages anyone can
            use:
          </Prose>
          <div className="grid gap-3 sm:grid-cols-2">
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
              body="A Model Context Protocol server exposing registry lookups, CID validation, and API-backed anchoring as tools, so AI agents can produce evidence packages without holding private keys."
            />
            <Point
              title="The webapp"
              body="The same interface with a UI: wallet-signed uploads across all twelve families, proof-only or stored, an explorer over anchored CIDs, cache payments, donations, and a credits dashboard."
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

        <Section id="roadmap" title="Roadmap — deliberately not in v1">
          <Prose>
            Earlier drafts of this protocol bundled an economic verification
            layer into version 1. It is now explicitly out of scope for v1 and
            staged as roadmap, to be shipped only where real usage proves the
            demand:
          </Prose>
          <div className="grid gap-3 sm:grid-cols-2">
            {ROADMAP_ITEMS.map((item) => (
              <Point key={item.title} title={item.title} body={item.body} />
            ))}
          </div>
          <Prose>
            Contract suites implementing this design exist in the repository
            and run on testnets as previews; the design is specified in the{" "}
            <a
              href={`${GITHUB_REPO}/blob/main/docs/governance.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              governance specification
            </a>
            . Nothing in v1 depends on them: no v1 flow requires a token, and
            every evidence package produced today remains verifiable unchanged
            if and when the market layer ships.
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
          <Prose>The contracts target ≥95% test coverage per runtime.</Prose>
        </Section>

        <Section id="status" title="Implementation status">
          <Prose>
            FileOnChain ships honestly: anchoring and storage are real wherever
            a chain is provisioned, and the registry&apos;s provisioning flags
            — not marketing copy — are the switch. The payload vocabulary
            (including data-carrying chunks), the per-family storage budgets,
            all twelve family clients with the includeData storage switch, the
            hosted API, and the MCP server are built and open source. Per-chain
            rollout is tracked in the chain registry: each network flips to
            real storage and anchoring when its contracts, modules, topics, or
            native channels are deployed, recorded, and QA&apos;d. The roadmap
            contract suites exist for five runtimes and run on testnets as
            previews — they are not part of the v1 product surface. Surfaces
            not yet wired to live deployments run against a clearly marked
            deterministic mock layer whose call signatures match the real
            integrations, so the seams swap without breaking callers.
          </Prose>
        </Section>

        <Section id="conclusion" title="Conclusion" anchor>
          <p className="font-display text-xl leading-relaxed text-foreground md:text-2xl">
            One interface in front. Every settlement system behind it.
          </p>
          <Prose>
            FileOnChain is one developer interface that creates portable,
            independently verifiable evidence packages across storage and
            settlement systems. One payload vocabulary makes the same evidence
            readable on twelve chain families; receipts and CIDs make every
            package checkable against public infrastructure with no service in
            the loop; optional on-chain storage — with a permanent-storage
            network as the suggested home — keeps the bytes themselves
            retrievable where a use case wants that. The protocol is
            deliberately minimal at its core — a JSON document, a hash, and a
            receipt — and deliberately honest at its edges: the economic
            verification layer is a staged roadmap, not a v1 promise, and each
            chain flips to real only as its deployment lands.
          </Prose>
        </Section>

        {/* Colophon */}
        <footer className="border-t border-border pt-6">
          <p className="text-sm leading-relaxed text-muted">
            FileOnChain is open source under the MIT license. This page
            describes protocol version 1; the verification-market design is a
            roadmap, previewed on testnets only. The canonical markdown version
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
            explains how to verify an evidence package by hand.
          </p>
        </footer>
      </article>
    </div>
  </PageShell>
);

export default WhitepaperPage;
