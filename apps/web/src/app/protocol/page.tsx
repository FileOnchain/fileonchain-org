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
    "How the FileOnChain protocol works: six independent layers — content integrity, identity and signatures, storage, settlement, evidence packaging, and deterministic local verification. No token, no market.",
  alternates: { canonical: `${siteConfig.url}/protocol` },
};

const LAYERS = [
  {
    title: "1 · Content integrity",
    body: "SHA-256 digests and CIDv1 identifiers bind bytes to names; signed manifests and Merkle trees bind a whole workflow's artifacts to one root, so one settlement transaction can anchor thousands of artifacts with individual inclusion proofs.",
  },
  {
    title: "2 · Identity & attribution",
    body: "Wallet signatures (EIP-191), agent and service keys (ed25519), organization keys, multiple signers, and delegated signing — an agent signing on behalf of an organization. Key-status URLs let a verifier check rotation and revocation.",
  },
  {
    title: "3 · Storage",
    body: "Three explicit modes per artifact: evidence-only (default — nothing stored), permanent on-chain storage (chunk bytes embedded in anchors, Autonomys suggested), or external storage (any URI you host). Each mode has its own receipt.",
  },
  {
    title: "4 · Settlement & timestamping",
    body: "One versioned anchor payload written through each chain's most native channel — a registry event, a remark, a memo. The transaction receipt (chain, hash, block, timestamp) is the evidence package's settlement receipt.",
  },
  {
    title: "5 · Evidence packaging",
    body: "A portable, canonically-encoded JSON bundle of everything above: artifact descriptor, signatures, storage receipts, settlement receipts, Merkle inclusion. It travels as a file — hand it to whoever needs to check it.",
  },
  {
    title: "6 · Verification",
    body: "fileonchain-verify evidence.json — deterministic, local, open source. Recomputes hashes, checks signatures and inclusion proofs, and optionally confirms receipts against public RPC endpoints. Never calls FileOnChain.",
  },
] as const;

const VERIFY_STEPS = [
  {
    title: "Recompute the hashes",
    body: "Hash the bytes you were given: the SHA-256 must match the artifact descriptor, and for batched artifacts the digest must prove into the anchored Merkle root through the package's inclusion proof.",
  },
  {
    title: "Check the signatures",
    body: "Each signature verifies against the public key embedded in the package, over the canonical signing payload. The verifier reports who signed — and whether a delegation is proven or merely claimed.",
  },
  {
    title: "Confirm the receipts",
    body: "Look up each settlement transaction on any public node or explorer of its chain. The block and timestamp are the chain's own record — no FileOnChain endpoint involved.",
  },
  {
    title: "Optionally, fetch the bytes",
    body: "Storage receipts say where copies live. If stored on-chain, walk the chunk trail and rebuild the file from public history — possible whenever the storage chain's history is available.",
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
 * /protocol — the six protocol layers, how independent verification works,
 * and the deliberately small v1 contract surface. No token, no staking, no
 * market: the earlier experiment lives on the archive branch only.
 */
const ProtocolPage = () => (
  <PageShell size="wide" padding="lg" atmosphere>
    <PageHeader
      className="mb-8"
      index="07"
      kicker="Protocol"
      title="Six layers, one portable package"
      lede="Content integrity, identity, storage, settlement, packaging, verification — each layer independent, each receipt checkable on its own system. The output is an evidence package anyone can validate locally with the open verifier, no FileOnChain service in the loop."
      actions={
        <ButtonLink href="/docs" variant="secondary">
          Read the docs →
        </ButtonLink>
      }
    />

    <section>
      <h2 className="text-lg font-semibold">The layers</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-muted">
        &ldquo;Verification&rdquo; is used precisely: each layer has its own check, and the
        layers compose without requiring each other — an unsigned hash-only package is valid
        evidence of integrity and time; signatures, storage, and more receipts extend the same
        schema.
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
      <h2 className="text-lg font-semibold">How anyone verifies a package</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-muted">
        Deterministic and local:{" "}
        <code className="font-mono text-xs">fileonchain-verify evidence.json --artifact file</code>{" "}
        runs every offline check; <code className="font-mono text-xs">--online</code> additionally
        confirms settlement receipts against public RPC endpoints of your choosing.
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
      <h2 className="text-lg font-semibold">What a package does — and does not — prove</h2>
      <Card className="mt-4 p-5">
        <p className="text-sm leading-relaxed text-muted">
          A passing verification shows that specific bytes{" "}
          <span className="font-medium text-foreground">existed</span> at a specific time, are{" "}
          <span className="font-medium text-foreground">unchanged</span>, and were{" "}
          <span className="font-medium text-foreground">signed by specific keys</span> — with
          receipts on public systems anyone can consult. It does not prove that the content is
          true, legally valid, or factually accurate; it does not prove who controls a key beyond
          the key itself; and repeated anchors on several chains are independent receipts, not a
          cross-chain proof — no chain verifies another chain&apos;s consensus in this design.
        </p>
      </Card>
    </section>

    <section className="mt-10">
      <h2 className="text-lg font-semibold">The contracts in v1</h2>
      <p className="mt-1 text-sm text-muted">
        The on-chain surface is deliberately small — and most families need no deployment at
        all, anchoring through the chain&apos;s native channel.
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
          API, database, or UI. Anchoring costs each chain&apos;s ordinary transaction fee, and
          hosted services charge account credits or USDC. An earlier experimental design for a
          staked verification market is preserved, unmaintained, on the{" "}
          <a
            href="https://github.com/FileOnchain/fileonchain-org/tree/archive/focat-verification-market"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2"
          >
            archive branch
          </a>{" "}
          — nothing in v1 depends on it. The full protocol specification lives in the{" "}
          <Link href="/whitepaper" className="text-primary underline underline-offset-2">
            white paper
          </Link>
          .
        </p>
      </Card>
    </section>
  </PageShell>
);

export default ProtocolPage;
