import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Protocol",
  description:
    "How the FileOnChain v1 protocol works: one anchor payload vocabulary across twelve chain families, evidence packages anyone can verify against public infrastructure, and an honestly staged roadmap for the economic verification layer.",
  alternates: { canonical: `${siteConfig.url}/protocol` },
};

const ANCHOR_STEPS = [
  {
    title: "1 · Chunk",
    body: "The file is split client-side into chunks sized to the storage chain's per-transaction budget; each chunk is hashed into a CIDv1 and forward-chained — every chunk anchor names the CID of the next.",
  },
  {
    title: "2 · Anchor the chunks",
    body: "One versioned JSON payload per chunk, written through the chain's most native channel — a contract event, a remark, a memo, transaction metadata, or a consensus message. On the storage chain the payload carries the chunk's bytes.",
  },
  {
    title: "3 · Anchor the file — last",
    body: "The file-level anchor names the root CID, an optional SHA-256, an optional storage URI pointing at the bytes, and the originating platform id. Indexers rely on chunks-first ordering to finalize the record in one pass.",
  },
  {
    title: "4 · Assemble the evidence package",
    body: "The CID, the payloads, and the transaction receipts (chain id, tx hashes, block, timestamp) form a portable bundle. It is a file — hand it to whoever needs to check it.",
  },
] as const;

const VERIFY_STEPS = [
  {
    title: "Recompute the CID",
    body: "Hash the bytes you were given and confirm they encode to the CID in the package. Content addressing makes the bytes self-authenticating — wherever they came from.",
  },
  {
    title: "Fetch the receipts",
    body: "Look up each transaction hash on any public node or block explorer of its chain. The block and timestamp are the chain's own record — no FileOnChain endpoint involved.",
  },
  {
    title: "Decode the payloads",
    body: "The anchor payload is an open, versioned JSON vocabulary (p: \"fileonchain\", v: 1) — parseAnchorPayload in the MIT-licensed SDK decodes it identically on every family, or read the JSON by eye.",
  },
  {
    title: "Optionally, rebuild the bytes",
    body: "If the file was stored on-chain, walk the chunk trail on the storage chain, base64-decode each data field, and verify every chunk's CID. The file reassembles from public history alone.",
  },
] as const;

const V1_CONTRACTS = [
  {
    name: "FileRegistry",
    role: "The anchor registry on contract runtimes (EVM, Aptos, Sui, Starknet, NEAR): anchorCID / anchorChunk write the payload as events, free beyond gas. Memo families (Cosmos, TRON, Cardano, TON) and native channels (Substrate remarks, Solana Memo, Hedera HCS) need no deployment at all.",
  },
  {
    name: "CachePayments",
    role: "USDC payments for the private cache tier: encrypted chunks served at CDN speeds for the duration paid. An adjacent service — retrieval acceleration, never a replacement for the chain.",
  },
  {
    name: "DonationEscrow",
    role: "Native-coin donations routed to public cache node operators — the free pin for research data, archives, and open-source releases.",
  },
] as const;

const ROADMAP_ITEMS = [
  {
    title: "Staked verification market",
    body: "File-level anchors could graduate from timestamps to economically backed claims: a proposer escrows a token tip and bond, the claim survives a challenge window, and staked validators earn the tip for policing it.",
  },
  {
    title: "Dispute juries",
    body: "Contested claims resolved by juries drawn from the validator set, with losing bonds and losing jurors slashed.",
  },
  {
    title: "Token bridging",
    body: "One global token supply moved across runtimes by governance-approved burn/mint bridges (ERC-7802 on EVM).",
  },
  {
    title: "Token governance",
    body: "Parameters, treasury, and upgrades owned by token holders through an on-chain Governor and timelock.",
  },
] as const;

/**
 * /protocol — what the v1 protocol actually is (the anchor payload
 * vocabulary and the evidence packages it produces, verifiable by anyone
 * against public infrastructure) plus the honestly staged roadmap for the
 * economic verification layer, which is previewed on testnets only.
 */
const ProtocolPage = () => (
  <PageShell size="wide" padding="lg" atmosphere>
    <PageHeader
      className="mb-8"
      index="07"
      kicker="Protocol"
      title="Evidence packages, verifiable by anyone"
      lede="One developer interface writes one anchor payload vocabulary across twelve chain families. What comes back is an evidence package — CID, payloads, receipts — that anyone can verify against public infrastructure, with no FileOnChain service in the loop."
      actions={
        <ButtonLink href="/docs" variant="secondary">
          Read the docs →
        </ButtonLink>
      }
    />

    <section>
      <h2 className="text-lg font-semibold">From file to evidence package</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {ANCHOR_STEPS.map((step) => (
          <Card key={step.title} className="p-5">
            <h3 className="font-medium">{step.title}</h3>
            <p className="mt-2 text-sm text-muted">{step.body}</p>
          </Card>
        ))}
      </div>
      <p className="mt-4 max-w-[70ch] text-sm text-muted">
        Storage is opt-in: most evidence use cases anchor proof-only, and the raw bytes never
        leave the caller&apos;s machine. When the bytes belong on-chain, the same payloads carry
        them — the{" "}
        <Link href="/whitepaper" className="text-primary underline underline-offset-2">
          white paper
        </Link>{" "}
        covers storage chains and per-family budgets.
      </p>
    </section>

    <section className="mt-10">
      <h2 className="text-lg font-semibold">How anyone verifies one</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-muted">
        Verification is mechanical and needs no permission, no wallet, and no FileOnChain
        endpoint — the package outlives the service that produced it.
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
      <h2 className="text-lg font-semibold">What an anchor does — and does not — prove</h2>
      <Card className="mt-4 p-5">
        <p className="text-sm leading-relaxed text-muted">
          An anchor proves that specific content <span className="font-medium text-foreground">existed</span>{" "}
          at a specific time and has <span className="font-medium text-foreground">not changed</span> since.
          It does not establish identity, authorship, signatures, retention policy, or admissibility —
          those belong to the e-signature, identity, and records-management systems layered on top.
          The evidence package is designed to slot into those systems as the integrity layer, not to
          replace them.
        </p>
      </Card>
    </section>

    <section className="mt-10">
      <h2 className="text-lg font-semibold">The contracts in v1</h2>
      <p className="mt-1 text-sm text-muted">
        v1 keeps the on-chain surface deliberately small — and most families need no deployment
        at all, anchoring through the chain&apos;s native channel.
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
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">Roadmap — deliberately not in v1</h2>
        <Badge variant="warning" size="sm">
          testnet preview only
        </Badge>
      </div>
      <p className="mt-1 max-w-[70ch] text-sm text-muted">
        Earlier drafts bundled an economic verification layer into v1. It is now explicitly out of
        scope — staged as roadmap, to ship only where real usage proves the demand. Contract
        suites implementing the design exist in the repository and run on testnets as previews;
        no v1 flow requires a token, and every evidence package produced today remains verifiable
        unchanged if and when this layer ships.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {ROADMAP_ITEMS.map((item) => (
          <Card key={item.title} className="p-5">
            <h3 className="font-medium">{item.title}</h3>
            <p className="mt-2 text-sm text-muted">{item.body}</p>
          </Card>
        ))}
      </div>
      <p className="mt-4 text-sm text-muted">
        The full design lives in the{" "}
        <a
          href="https://github.com/FileOnchain/fileonchain-org/blob/main/docs/governance.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2"
        >
          governance specification
        </a>{" "}
        and the{" "}
        <Link href="/whitepaper#roadmap" className="text-primary underline underline-offset-2">
          white paper&apos;s roadmap section
        </Link>
        .
      </p>
    </section>
  </PageShell>
);

export default ProtocolPage;
