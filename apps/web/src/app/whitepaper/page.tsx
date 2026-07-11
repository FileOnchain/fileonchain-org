import * as React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import Badge from "@/components/ui/Badge";

export const metadata: Metadata = {
  title: "White Paper",
  description:
    "The FileOnChain white paper: one developer interface that creates portable, independently verifiable evidence packages across storage and settlement systems — content integrity, identity and signatures, explicit storage modes, settlement receipts, and a deterministic local verifier.",
  alternates: { canonical: "/whitepaper" },
  openGraph: {
    title: "White Paper · FileOnChain",
    description:
      "Evidence packages: hashes, signatures, storage and settlement receipts — verified locally, without trusting FileOnChain.",
    url: "/whitepaper",
    type: "article",
  },
  // Without this, the root layout's twitter block (homepage copy) is
  // inherited wholesale — metadata merges shallowly per top-level key.
  twitter: {
    card: "summary_large_image",
    title: "White Paper · FileOnChain",
    description:
      "Evidence packages: hashes, signatures, storage and settlement receipts — verified locally, without trusting FileOnChain.",
  },
};

const GITHUB_REPO = "https://github.com/FileOnchain/fileonchain-org";
const WHITEPAPER_MD = `${GITHUB_REPO}/blob/main/docs/whitepaper.md`;
const ARCHIVE_BRANCH = `${GITHUB_REPO}/tree/archive/focat-verification-market`;

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
  { id: "customer", label: "The v1 customer" },
  { id: "layers", label: "The six layers" },
  { id: "evidence", label: "The evidence package" },
  { id: "identity", label: "Identity & signatures" },
  { id: "manifests", label: "Manifests & storage modes" },
  { id: "anchoring", label: "Anchoring & receipts" },
  { id: "integrations", label: "v1 integrations" },
  { id: "trust", label: "Trust & threat model" },
  { id: "verifier", label: "The local verifier" },
];

const ANCHOR_SECTION: DocSection = { id: "conclusion", label: "Conclusion" };

const CHUNK_TOTAL = CHUNK_SECTIONS.length;

const chunkIndexOf = (id: string): number =>
  CHUNK_SECTIONS.findIndex((s) => s.id === id);

const pad2 = (n: number): string => String(n).padStart(2, "0");

/* ------------------------------------------------------------------ */
/* Reference data                                                      */
/* ------------------------------------------------------------------ */

const LAYERS = [
  {
    title: "1 · Content integrity",
    body: "Hashing, CIDs, and manifests. SHA-256 digests and CIDv1 identifiers bind bytes to names; manifests and Merkle trees bind many artifacts to one root.",
  },
  {
    title: "2 · Identity & attribution",
    body: "Signatures and signer information: wallet keys, organization keys, agent keys — with delegation and key-status metadata.",
  },
  {
    title: "3 · Storage",
    body: "Where the bytes live: on-chain on a storage-capable network, on an external system, or nowhere (hash-only evidence). Each mode has an explicit receipt.",
  },
  {
    title: "4 · Settlement & timestamping",
    body: "Transactions on public chains (or other timestamp systems) that fix a hash or Merkle root at a block and time.",
  },
  {
    title: "5 · Evidence packaging",
    body: "The versioned, canonical bundle of layers 1–4 that travels as a file.",
  },
  {
    title: "6 · Verification",
    body: "Deterministic local validation of a package by the open verifier, with no FileOnChain service in the loop.",
  },
] as const;

const PACKAGE_CONTENTS = [
  {
    title: "Artifact descriptor",
    body: "CIDv1, SHA-256 of the raw bytes, byte length, media type, name, and flat provenance metadata — model id, prompt hash, tool versions, run id: how the artifact was created.",
  },
  {
    title: "Signatures",
    body: "Zero or more, each with the signer's identity (wallet, organization, agent, human, or service), public key, scheme (eip191, ed25519), optional delegation, optional key-status URL, and the canonical signing-payload hash.",
  },
  {
    title: "Storage receipts",
    body: "One per copy of the bytes: evidence-only (nothing stored), onchain-storage (a fileonchain:// URI plus chunk transactions), or external-storage (any URI the caller hosts).",
  },
  {
    title: "Settlement receipts",
    body: "One per anchoring transaction: chain id, transaction hash, block, the chain's timestamp, and the anchor payload written, verbatim.",
  },
  {
    title: "Merkle inclusion",
    body: "When the artifact was batch-anchored through a manifest: the root, the leaf index, and the sibling proof path.",
  },
  {
    title: "Session identifier",
    body: "Ties the packages of one workflow together, and supports parent-child evidence relationships across manifests.",
  },
] as const;

const VERIFIER_ANSWERS = [
  { q: "Are these the original bytes?", a: "Recompute SHA-256 and compare." },
  {
    q: "Who signed them?",
    a: "Check each signature against its embedded key; report the claimed identity and delegation behind it.",
  },
  {
    q: "When were they signed or anchored?",
    a: "Signing times are asserted; anchoring times come from settlement receipts any chain node can confirm.",
  },
  { q: "Where are they stored?", a: "Storage receipts name each copy and its mode." },
  {
    q: "Has the signing key been revoked?",
    a: "Only if the signer declared a key-status endpoint — otherwise the verifier reports unknown, because a signature alone cannot prove non-revocation.",
  },
  {
    q: "Can every receipt be independently verified?",
    a: "Offline checks are deterministic; online confirmation talks only to public RPC endpoints the verifier chooses.",
  },
] as const;

const INTEGRATION_ROWS = [
  {
    system: "Autonomys (mainnet + Taurus)",
    role: "Primary permanent-storage system — native remarks, no deployment needed",
    status: "Integrated into the webapp",
    live: true,
  },
  {
    system: "Solana (mainnet + devnet)",
    role: "Non-EVM portability demonstration — native SPL Memo, no deployment needed",
    status: "Integrated into the webapp",
    live: true,
  },
  {
    system: "EVM — Sepolia, Auto EVM Chronos",
    role: "Contract-based settlement via the anchor-only FileRegistry",
    status: "Testnet deployed",
    live: true,
  },
  {
    system: "Auto EVM mainnet",
    role: "EVM settlement target — flips active when the Chronos-tested registry lands",
    status: "Testnet deployed (mainnet pending)",
    live: false,
  },
  {
    system: "Aptos · Sui · Starknet · NEAR · Cosmos · TRON · Cardano · TON · Hedera",
    role: "Roadmap adapters — SDK clients implemented, anchor-only contracts where needed",
    status: "Implemented",
    live: false,
  },
] as const;

const TRUST_POINTS = [
  {
    title: "Always",
    body: "Your own signing-key custody; SHA-256 and the signature schemes; the canonical-encoding implementation.",
  },
  {
    title: "When identity matters",
    body: "The binding between a key and a real-world identity — an identity provider, a published key, an organization's own attestation. The package proves the key, not the person.",
  },
  {
    title: "When storing on-chain",
    body: "The selected storage network's retention model and the availability of its archival infrastructure.",
  },
  {
    title: "When anchoring",
    body: "The settlement network's consensus — including reorganizations: treat receipts as final only past the chain's finality depth.",
  },
  {
    title: "When retrieving",
    body: "The RPC and archive providers used for reads. Providers are swappable, and content addressing catches tampered responses.",
  },
  {
    title: "When using the hosted API",
    body: "FileOnChain's execution — the worker signs and sends what you asked. Hash-only requests never expose artifact bytes; delegated execution is a convenience, never required for verification.",
  },
  {
    title: "When encrypting",
    body: "The encryption implementation and your key custody — key loss makes encrypted permanent data unrecoverable.",
  },
  {
    title: "Failure modes, accounted for",
    body: "Key compromise and revocation (distinct verifier checks), malicious metadata (signed, not fact-checked), unavailable storage providers and dead external URLs (integrity is hash-bound, not location-bound), chain reorganizations, conflicting signatures (the verifier shows exactly who signed what), and replay (signatures bind to the artifact hash and session).",
  },
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
      lede="An evidence package bundles an artifact's hashes, the signatures of whoever — or whatever — produced it, storage receipts, and settlement receipts from public chains. An open local verifier validates it without trusting FileOnChain. No token, no market: v1 is the narrow thing, built for AI agents and automated workflows."
    />

    {/* Document plaque — this paper rendered as the file record it would
        be if uploaded: name, version, chunk count, license, source. */}
    <div className="mb-12 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-surface px-4 py-3 font-mono text-[11px] text-muted">
      <span className="font-semibold text-foreground">docs/whitepaper.md</span>
      <span aria-hidden className="text-border">|</span>
      <span>v2.0 · July 2026</span>
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
            for AI agents that turn an artifact into an{" "}
            <em>evidence package</em>: a portable JSON document bundling the
            artifact&apos;s CID and cryptographic hashes, the signatures and
            identities of whoever (or whatever) produced it, storage receipts
            for where the bytes live, and settlement receipts from the public
            chains that anchored it. A separate open-source verifier — a
            library and a CLI,{" "}
            <code className="font-mono text-xs">fileonchain verify evidence.json</code>{" "}
            — validates a package deterministically and locally, without
            trusting FileOnChain or calling any of its services.
          </Prose>
          <Prose>
            Version 1 is deliberately narrow: built for developers shipping AI
            agents and automated workflows, launched on a small set of
            genuinely functional integrations, with every other chain family
            shipped as a roadmap adapter carrying an explicit integration
            status. There is no token, no staking, no validator set, and no
            on-chain governance anywhere in v1 — anchoring costs each
            chain&apos;s ordinary transaction fee, and hosted services charge
            account credits or USDC. The entire stack is open source under
            the MIT license.
          </Prose>
        </Section>

        <Section id="motivation" title="Motivation">
          <Prose>
            Automated systems now produce artifacts that people need to rely
            on: agent-generated reports, code-generation outputs, tool-call
            logs, deployment artifacts, automated approvals. Relying on them
            raises four questions — <em>are these the original bytes? who or
            what produced them? when? and can I check this myself?</em> —
            that today&apos;s infrastructure answers badly:
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
              <span className="font-medium text-foreground">
                Integrity without identity is half an answer.
              </span>{" "}
              A content hash proves bytes are unchanged; it says nothing
              about who created or approved them. Attribution needs
              signatures and key management, not just hashes.
            </li>
            <li>
              <span className="font-medium text-foreground">
                Integration cost lands on the developer.
              </span>{" "}
              Teams that just want a tamper-evident record end up evaluating
              wallets, RPC providers, and payload formats per chain —
              complexity that has nothing to do with their product.
            </li>
          </ul>
        </Section>

        <Section id="customer" title="The v1 customer and use case">
          <Prose>
            Version 1 targets developers building AI agents and automated
            workflows. The core use case:
          </Prose>
          <blockquote className="border-l-2 border-accent pl-4 text-[15px] leading-[1.75] text-foreground md:text-base">
            Create an independently verifiable record of what an agent or
            automated system produced, who or what produced it, when it was
            produced, and whether the artifact has changed.
          </blockquote>
          <Prose>
            Concrete examples: agent-generated reports, code-generation
            outputs, tool-call logs, deployment artifacts, model and prompt
            metadata, financial or operational instructions, research
            outputs, automated approval records.
          </Prose>
          <Prose>
            Legal and compliance evidence, NFT media, archival preservation,
            and consumer storage are <em>possible future applications</em>,
            not simultaneous v1 target markets. Where those users arrive
            early, the boundary is stated plainly: an evidence package proves
            existence, integrity, signing keys, and timing — it does not
            prove that a document is true, legally valid, or factually
            accurate, and it does not by itself establish legal authorship or
            admissibility.
          </Prose>
        </Section>

        <Section id="layers" title="The six protocol layers">
          <Prose>
            &ldquo;Verify&rdquo; means something different at each layer, so
            the layers are named rather than overloading the word. They
            compose but do not require each other: an unsigned hash-only
            package is valid (integrity + time), and a fully signed, stored,
            and anchored package is the same schema with more receipts.
          </Prose>
          <div className="grid gap-3 sm:grid-cols-2">
            {LAYERS.map((layer) => (
              <Point key={layer.title} title={layer.title} body={layer.body} />
            ))}
          </div>
        </Section>

        <Section id="evidence" title="The evidence package">
          <Prose>
            An evidence package (
            <code className="font-mono text-xs">p: &quot;fileonchain-evidence&quot;, v: 1</code>
            ) is a core, versioned v1 protocol specification — implemented in{" "}
            <code className="font-mono text-xs">packages/utils/src/evidence.ts</code>{" "}
            and shared byte-for-byte by the SDK, the hosted API, the MCP
            server, and the webapp. It contains, where applicable:
          </Prose>
          <div className="grid gap-3 sm:grid-cols-2">
            {PACKAGE_CONTENTS.map((c) => (
              <Point key={c.title} title={c.title} body={c.body} />
            ))}
          </div>
          <Prose>
            Signatures and package hashes are computed over a{" "}
            <span className="font-medium text-foreground">canonical JSON form</span>{" "}
            — object keys sorted at every depth, no insignificant whitespace,
            UTF-8 — so every implementation produces byte-identical canonical
            output for the same package. The interchange form on disk stays
            human-readable JSON; a compact binary canonical representation is
            a documented candidate for a future schema version.
          </Prose>
        </Section>

        <Section id="identity" title="Identity and signatures">
          <Prose>
            A CID proves content integrity; it does not prove who created or
            approved the content. v1 makes identity first-class: wallet
            signatures (EIP-191 against an EVM address), agent and service
            keys (ed25519), organization keys, multiple signers per package,
            and delegated signing — an agent signing{" "}
            <code className="font-mono text-xs">onBehalfOf</code> an
            organization, with an optional verifiable authorization
            statement. When the statement is absent, the verifier reports the
            delegation as claimed, not proven.
          </Prose>
          <Prose>
            Keys are referenced by value, and each signer may declare a
            key-status URL where rotation and revocation can be checked.
            Revocation registries are deliberately outside the package
            format: a portable document cannot prove a key&apos;s future
            status, so the verifier surfaces key status as a distinct,
            possibly-unknown check. What is signed is the canonical form of
            the package identity and artifact descriptor — not the receipts,
            which are produced after signing and are each independently
            verifiable on their own system.
          </Prose>
        </Section>

        <Section id="manifests" title="Manifests, batching, and storage modes">
          <Prose>
            Agent workflows produce many small artifacts; one settlement
            transaction per artifact is wasteful. A{" "}
            <span className="font-medium text-foreground">signed manifest</span>{" "}
            lists a workflow&apos;s artifacts; a Merkle tree over their
            SHA-256 digests reduces the batch to one root; and a single
            settlement transaction anchors the root — hundreds or thousands
            of artifacts — while each artifact&apos;s evidence package
            carries its own inclusion proof. Session identifiers and parent
            roots support workflow grouping and parent-child evidence
            relationships. For agent logs, anchoring a signed manifest per
            session is the recommended default — not storing every event
            on-chain.
          </Prose>
          <Prose>Storage is a per-artifact choice, never a requirement:</Prose>
          <div className="grid gap-3 sm:grid-cols-2">
            <Point
              title="Evidence only — the default"
              body="Hash, signatures, timestamp. The bytes never leave the caller's custody. Right for most agent logs and anything sensitive."
            />
            <Point
              title="Permanent storage + evidence"
              body="Chunk bytes embedded in anchor transactions on a storage-capable chain, sized to its per-transaction budget — 64 KiB on Autonomys, the suggested storage home. The receipt carries the fileonchain:// URI and the chunk transactions."
            />
            <Point
              title="External storage + evidence"
              body="The caller hosts bytes anywhere (IPFS, S3, Auto Drive, HTTPS); the receipt records the URI. The package stays verifiable if the URL later dies — integrity is bound to hashes, not locations."
            />
            <Point
              title="Privacy defaults"
              body="Hash-only anchoring by default; client-side encryption before any storage; the hosted API never receives plaintext bytes unless explicitly sent. Losing an encryption key makes encrypted permanent data unrecoverable — permanence cuts both ways."
            />
          </div>
        </Section>

        <Section id="anchoring" title="Anchoring, receipts, and honest terminology">
          <Prose>
            Every anchor, on every supported system, is one versioned JSON
            vocabulary (<code className="font-mono text-xs">p: &quot;fileonchain&quot;, v: 1</code>)
            with three operations: <code className="font-mono text-xs">chunk</code>,{" "}
            <code className="font-mono text-xs">anchor</code>, and{" "}
            <code className="font-mono text-xs">manifest</code>. Chunk anchors
            are written first and the file-level anchor last, so indexers can
            finalize a record in one pass.
          </Prose>
          <Prose>
            Writing the same CID or root to several chains produces{" "}
            <span className="font-medium text-foreground">multi-system receipts</span>{" "}
            — independent, chain-native attestations that each say
            &ldquo;this hash existed at this time on this system.&rdquo;
            That is portable evidence: if one chain becomes unavailable or
            untrusted, the other receipts stand on their own. It is{" "}
            <span className="font-medium text-foreground">not a cross-chain proof</span>
            : no chain verifies another chain&apos;s consensus or state in
            this design, and writing a CID to chain B proves nothing about
            chain A.
          </Prose>
          <Prose>
            Retrieval honesty: durability depends on the selected storage
            system and the availability of historical or archival
            infrastructure — not every ordinary node retains and serves old
            transaction data forever. Precisely: an artifact can be
            independently reconstructed and verified without trusting the
            FileOnChain indexer, <em>provided the underlying storage history
            is available</em> — and an indexer is still normally required for
            efficient CID-to-transaction discovery.
          </Prose>
        </Section>

        <Section id="integrations" title="v1 integrations — honest statuses">
          <Prose>
            v1 does not present twelve chain families as equally supported.
            Every network carries an explicit integration status on the
            ladder <em>designed → implemented → tested locally → testnet
            deployed → mainnet deployed → integrated into the webapp →
            production ready → externally audited</em>, and product surfaces
            must not describe a network beyond its status.
          </Prose>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-elevated/60">
                  {["System", "Role in v1", "Status"].map((h) => (
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
                {INTEGRATION_ROWS.map((row) => (
                  <tr key={row.system} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2.5 font-medium text-foreground">{row.system}</td>
                    <td className="px-4 py-2.5 text-muted">{row.role}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <Badge variant={row.live ? "success" : "warning"} size="sm">
                        {row.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Prose>
            Mocked or partially implemented integrations are never described
            as shipped; the registry&apos;s flags (
            <code className="font-mono text-xs">packages/utils/src/chains.ts</code>
            ), not marketing copy, are the switch.
          </Prose>
        </Section>

        <Section id="trust" title="Trust and threat model">
          <Prose>What a user must trust, stated per mode:</Prose>
          <div className="grid gap-3 sm:grid-cols-2">
            {TRUST_POINTS.map((point) => (
              <Point key={point.title} title={point.title} body={point.body} />
            ))}
          </div>
        </Section>

        <Section id="verifier" title="The local verifier — and what v1 leaves out">
          <Prose>
            The most important component is{" "}
            <code className="font-mono text-xs">@fileonchain/verify</code>:
            an open-source verification library and CLI. It verifies artifact
            hashes, manifest integrity, signatures and signer information,
            storage receipts, settlement receipts, Merkle inclusion proofs,
            and the package version and canonical encoding — deterministic
            and local. Verification never requires calling FileOnChain&apos;s
            API; the optional online pass talks only to public RPC endpoints
            the verifier chooses.
          </Prose>
          <Prose>Given a package, it answers exactly:</Prose>
          <div className="grid gap-3 sm:grid-cols-2">
            {VERIFIER_ANSWERS.map((item) => (
              <Point key={item.q} title={item.q} body={item.a} />
            ))}
          </div>
          <Prose>
            <span className="font-medium text-foreground">
              What v1 explicitly does not include:
            </span>{" "}
            no FOCAT token, no validator staking, no tips or bonds, no
            challenge periods, no juries, no slashing, no token bridges, no
            token voting, no governor or timelock, no platform fee splits —
            in the contracts, the SDKs, the API, the database, or the UI.
            Anchoring costs each chain&apos;s ordinary transaction fee;
            hosted services charge ordinary account credits, fiat, or USDC.
            An earlier experimental design for a staked verification market
            is preserved, unmaintained, on the{" "}
            <a
              href={ARCHIVE_BRANCH}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              archive branch
            </a>
            ; nothing in v1 depends on it.
          </Prose>
        </Section>

        <Section id="conclusion" title="Conclusion" anchor>
          <p className="font-display text-xl leading-relaxed text-foreground md:text-2xl">
            Six small layers. One portable package. Independently verifiable
            — literally.
          </p>
          <Prose>
            FileOnChain v1 is one developer interface that creates portable,
            independently verifiable evidence packages across storage and
            settlement systems — and an open verifier that makes
            &ldquo;independently&rdquo; literal. Hashes and manifests for
            integrity, signatures for attribution, explicit storage modes,
            chain-native settlement receipts, a canonical package format, and
            deterministic local verification. It launches narrow — agents and
            automated workflows, a handful of honest integrations — and grows
            by adding adapters and receipts, not promises.
          </Prose>
        </Section>

        {/* Colophon */}
        <footer className="border-t border-border pt-6">
          <p className="text-sm leading-relaxed text-muted">
            FileOnChain is open source under the MIT license. This page
            describes protocol version 1: evidence-package schema v1, anchor
            payload vocabulary v1, manifest format v1. The canonical markdown
            version of this document lives{" "}
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
            walks through verifying a package by hand.
          </p>
        </footer>
      </article>
    </div>
  </PageShell>
);

export default WhitepaperPage;
