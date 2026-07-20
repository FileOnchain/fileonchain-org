import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Protocol",
  description:
    "The FileOnChain Evidence Protocol: a neutral, independently implementable envelope format — subject, claims, artifact and envelope signatures, receipt adapters, application profiles — verified locally by an open verifier. No token, no market.",
  alternates: { canonical: `${siteConfig.url}/protocol` },
};

const GITHUB_REPO = "https://github.com/FileOnchain/fileonchain-org";
const PROTOCOL_SPEC = `${GITHUB_REPO}/blob/main/docs/protocol/evidence-protocol.md`;

const LAYERS = [
  {
    title: "1 · The envelope",
    body: "One portable JSON document: a subject (digests, size, media type), namespaced claims about it, artifact and envelope signatures, receipts, and extensions — sealed by an envelope digest computed over the canonical encoding, so any implementation produces byte-identical output.",
  },
  {
    title: "2 · Artifact vs envelope signatures",
    body: "Two distinct questions, two distinct signature sets. Artifact signatures cover the subject and claims — who made or approved the thing, including delegated signing. Envelope signatures cover the finalized envelope digest — who assembled the evidence. The verifier reports them separately.",
  },
  {
    title: "3 · Receipt adapters",
    body: "Storage, settlement, and inclusion receipts each name the adapter that produced them and the system they point at. Verification of a receipt is delegated to its adapter, so new storage or settlement systems plug in without changing the envelope format.",
  },
  {
    title: "4 · Application profiles",
    body: "The core protocol is neutral; profiles are opinionated. A profile defines required claims in its namespace and their validation — the Agent Evidence Profile (org.fileonchain.agent/v1), covering agent runs, tool calls, approvals, and policies, is the first.",
  },
  {
    title: "5 · Reference implementations",
    body: "The spec is normative; the packages are one implementation of it. @fileonchain/protocol (envelope building and validation), @fileonchain/agent-profile, the SDK's sealing helpers, and @fileonchain/verify are all MIT — and anyone can implement the protocol without them.",
  },
  {
    title: "6 · Verification",
    body: "fileonchain verify evidence.json — deterministic, local, open source. Recomputes digests, checks both signature sets and inclusion proofs, dispatches receipts to their adapters, and optionally confirms settlement receipts against public RPC endpoints. Never calls FileOnChain.",
  },
] as const;

const VERIFY_STEPS = [
  {
    title: "Recompute the digests",
    body: "Hash the bytes you were given: the SHA-256 must match the envelope's subject, and for batched artifacts the digest must prove into the anchored Merkle root through the envelope's inclusion receipt.",
  },
  {
    title: "Check both signature sets",
    body: "Artifact signatures verify against the keys embedded in the envelope, over the canonical signing payload; envelope signatures verify over the envelope digest. The verifier reports who signed, who assembled — and whether a delegation is proven or merely claimed.",
  },
  {
    title: "Confirm the receipts",
    body: "Each receipt is checked by its adapter; settlement transactions can be looked up on any public node or explorer of their system. The block and timestamp are the system's own record — no FileOnChain endpoint involved.",
  },
  {
    title: "Run it yourself",
    body: "fileonchain verify evidence.json in a terminal, or paste the envelope into the /verify page — the same isomorphic verifier runs in your browser. The report never collapses to a single green check: valid, valid with warnings, incomplete, and invalid stay distinct.",
  },
] as const;

const V1_CONTRACTS = [
  {
    name: "FileRegistry",
    role: "A minimal anchor registry on contract runtimes (EVM, Aptos, Sui, Starknet, NEAR): event-carrier writes for chunk, file, and manifest payloads, plus an optional first-write CID record on EVM. Free beyond gas — no token anywhere. Memo families and native channels (Substrate remarks, Solana Memo, Hedera HCS) need no deployment at all.",
  },
  {
    name: "CachePayments",
    role: "USDC payments for the private cache tier: client-side-encrypted chunks served at CDN speeds for the duration paid. Retrieval acceleration — never a replacement for the chain.",
  },
  {
    name: "DonationEscrow",
    role: "Native-coin donations routed to public cache node operators — the free pin for research data, archives, and open-source releases.",
  },
] as const;

/**
 * /protocol — the FileOnChain Evidence Protocol: the neutral envelope
 * format, artifact vs envelope signatures, receipt adapters, application
 * profiles, reference implementations, and honest verification limits.
 * The Agent Evidence Profile builds on it; FileOnChain Cloud hosts it.
 */
const ProtocolPage = () => (
  <PageShell size="wide" padding="lg" atmosphere>
    <PageHeader
      className="mb-8"
      index="07"
      kicker="Protocol"
      title="A neutral protocol, one portable envelope"
      lede="The FileOnChain Evidence Protocol defines an evidence envelope — subject, claims, signatures, receipts — that anyone can produce and anyone can verify locally with the open verifier, no FileOnChain service in the loop. Application profiles like the Agent Evidence Profile make it opinionated; the core stays neutral and independently implementable."
      actions={
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/agent-evidence">Agent Evidence →</ButtonLink>
          <ButtonLink
            href={PROTOCOL_SPEC}
            target="_blank"
            rel="noopener noreferrer"
            variant="secondary"
          >
            Read the spec →
          </ButtonLink>
        </div>
      }
    />

    <section>
      <h2 className="text-lg font-semibold">The architecture</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-muted">
        Each concept has its own check, and they compose without requiring each other — an
        unsigned hash-only envelope is valid evidence of integrity and time; signatures,
        receipts, and profile claims extend the same schema. The normative specification lives{" "}
        <a
          href={PROTOCOL_SPEC}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2"
        >
          on GitHub
        </a>
        .
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {LAYERS.map((layer) => (
          <Card key={layer.title} className="p-5">
            <h3 className="font-medium">{layer.title}</h3>
            <p className="mt-2 text-sm text-muted">{layer.body}</p>
          </Card>
        ))}
      </div>
    </section>

    <section className="mt-10">
      <h2 className="text-lg font-semibold">How anyone verifies an envelope</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-muted">
        Deterministic and local:{" "}
        <code className="font-mono text-xs">fileonchain verify evidence.json</code> runs every
        offline check; the online pass additionally confirms settlement receipts against public
        RPC endpoints of your choosing. The{" "}
        <Link href="/verify" className="text-primary underline underline-offset-2">
          /verify page
        </Link>{" "}
        runs the same verifier in your browser — no account, no wallet.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {VERIFY_STEPS.map((step) => (
          <Card key={step.title} className="p-5">
            <h3 className="font-medium">{step.title}</h3>
            <p className="mt-2 text-sm text-muted">{step.body}</p>
          </Card>
        ))}
      </div>
    </section>

    <section className="mt-10">
      <h2 className="text-lg font-semibold">What cannot be verified</h2>
      <Card className="mt-4 p-5">
        <p className="text-sm leading-relaxed text-muted">
          A passing verification shows that specific bytes{" "}
          <span className="font-medium text-foreground">existed</span> at a specific time, are{" "}
          <span className="font-medium text-foreground">unchanged</span>, and were{" "}
          <span className="font-medium text-foreground">signed by specific keys</span> — with
          receipts on public systems anyone can consult. It cannot verify{" "}
          <span className="font-medium text-foreground">truthfulness</span> (signed claims are
          attested, not fact-checked), <span className="font-medium text-foreground">legal
          validity</span> (an envelope is not, by itself, a legal instrument), or{" "}
          <span className="font-medium text-foreground">identity beyond the key</span> (who
          controls a key is a claim unless an external attestation proves it). And multiple
          settlement receipts are independent attestations, not a proof that one system verified
          another — no system verifies another&apos;s consensus in this design.
        </p>
      </Card>
    </section>

    <section className="mt-10">
      <h2 className="text-lg font-semibold">The contracts in v1</h2>
      <p className="mt-1 text-sm text-muted">
        The on-chain surface is deliberately small — and most families need no deployment at
        all, anchoring through the system&apos;s native channel.
      </p>
      <Card className="mt-4 divide-y divide-border/60 p-0">
        {V1_CONTRACTS.map((contract) => (
          <div key={contract.name} className="p-4">
            <h3 className="font-mono text-sm font-medium">{contract.name}</h3>
            <p className="mt-1 text-sm text-muted">{contract.role}</p>
          </div>
        ))}
      </Card>
    </section>

    <section className="mt-10">
      <h2 className="text-lg font-semibold">What v1 leaves out — on purpose</h2>
      <Card className="mt-4 p-5">
        <p className="text-sm leading-relaxed text-muted">
          No token, no validator staking, no tips or bonds, no challenge windows, no juries, no
          slashing, no bridges, no token governance, no fee splits — anywhere: contracts, SDKs,
          API, database, or UI. Anchoring costs each system&apos;s ordinary transaction fee, and
          hosted services charge account credits or USDC. An earlier experimental design for a
          staked verification market is preserved, unmaintained, on the{" "}
          <a
            href={`${GITHUB_REPO}/tree/archive/focat-verification-market`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2"
          >
            archive branch
          </a>{" "}
          — nothing in v1 depends on it. The specification, the profiles, and the product
          overview are collected on the{" "}
          <Link href="/whitepaper" className="text-primary underline underline-offset-2">
            documents page
          </Link>
          .
        </p>
      </Card>
    </section>
  </PageShell>
);

export default ProtocolPage;
