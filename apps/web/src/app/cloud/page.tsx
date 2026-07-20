import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { CloudShell } from "@/components/cloud/CloudShell";
import { FeatureCard, type CloudFeature } from "@/components/cloud/FeatureCard";
import { isCloudEvidenceEnabled } from "@/lib/server/cloud-feature";

/**
 * /cloud — marketing landing for FileOnChain Cloud. Server component:
 * static prose + a feature grid mirroring `/agent-evidence`. Every
 * `Planned` card renders the warning `Planned` badge; the body
 * sub-heading explicitly notes the gated-wired state.
 *
 * `Available` cards describe what's genuinely live (anchoring API, MCP,
 * dashboard, billing). `Planned` cards describe what's wired but
 * gated behind `FILEONCHAIN_CLOUD_EVIDENCE_ENABLED`.
 */

const FEATURES: CloudFeature[] = [
  {
    title: "Hosted anchoring with credits",
    body: "POST an artifact hash to the hosted API with a fok_ key; a funded worker settles it on the network you chose and returns the receipts.",
    status: "Available",
  },
  {
    title: "MCP server for AI agents",
    body: "stdio Model Context Protocol server: read-only network-registry tools plus API-backed anchoring tools, so agents produce evidence without holding private keys.",
    status: "Available",
  },
  {
    title: "Dashboard, API keys & activity history",
    body: "Scoped API keys, job polling for anchor requests, activity logs, and a dashboard of everything your keys have sealed.",
    status: "Available",
  },
  {
    title: "Credit billing in USD/USDC",
    body: "Credit ledger denominated in micro-USDC; deposits in USDC, hosted anchoring debits credits per job (refunded on send failure).",
    status: "Available",
  },
  {
    title: "Evidence ingestion",
    body: "POST a sealed envelope to /api/v1/evidence; Cloud stores it under your org, recomputes the envelope digest, and stamps the retention policy.",
    status: "Planned",
  },
  {
    title: "Agent-run sealing",
    body: "POST an Agent Evidence Profile envelope to /api/v1/agent-runs; Cloud records runId + agentId for run-centric reads via /api/v1/agent-runs/:runId.",
    status: "Planned",
  },
  {
    title: "Server-side signer (server_sign)",
    body: "Generate a per-org ed25519 key and pass ?server_sign=1; Cloud adds an envelope signature — a service identity attesting it assembled the envelope. Never an artifact signature, so it makes no claim about who authored the subject. Verifiers resolve the public key status URL independently.",
    status: "Planned",
  },
  {
    title: "Retention & search",
    body: "Per-org retention window editor; new envelopes are stamped with an expiry and a daily Vercel Cron sweep deletes expired rows. Full-text + claim-level search across the org's envelopes, indexed by a Postgres tsvector, with a multi-org scope picker.",
    status: "Planned",
  },
  {
    title: "Hosted verification pages",
    body: "Shareable per-envelope verification pages for counterparties who won't run a CLI. The local verifier remains the ground truth — hosted pages are a convenience, never a requirement.",
    status: "Planned",
  },
  {
    title: "Server-side verify",
    body: "POST an envelopeId or envelope to /api/v1/verify; Cloud runs the open verifier and returns the same VerificationReport shape as @fileonchain/verify.",
    status: "Planned",
  },
  {
    title: "Projects, quotas, per-project signers",
    body: "Sub-org tenancy with monthly caps on envelopes + anchors + bytes anchored, and an optional per-project service signer for project-attributed envelope sealing.",
    status: "Planned",
  },
  {
    title: "Webhooks",
    body: "Subscribe URLs to envelope and anchor events. HMAC-SHA-256 signed delivery with exponential backoff and a per-minute drain so retries happen within minutes, not hours.",
    status: "Planned",
  },
  {
    title: "Bulk `.evidence.json` exports",
    body: "Stream every envelope (or a filtered subset) into a TAR archive of canonical `.evidence.json` files. Token-bound download links expire 24 hours after the build.",
    status: "Planned",
  },
  {
    title: "Compliance reports & SLAs",
    body: "Monthly signed summaries plus tier-based uptime and settlement-latency promises, ready to share with auditors or partners.",
    status: "Planned",
  },
];

export default function CloudPage() {
  const enabled = isCloudEvidenceEnabled();
  return (
    <CloudShell enabled={enabled} surfaceLabel="The Cloud evidence surface">
      <PageHeader
        className="mb-8"
        index="03"
        kicker="Cloud"
        title="FileOnChain Cloud — the convenient way to run it"
        lede="Managed anchoring, dashboard, and billing for teams that want evidence without operating wallets, RPC endpoints, and signers themselves. The hosted product removes the operational work — honestly labeled by what's live today."
        actions={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/cloud/verify" variant="secondary">
              Hosted verifier
            </ButtonLink>
            <ButtonLink href="/cloud/search" variant="secondary">
              Search evidence
            </ButtonLink>
            <ButtonLink href="/cloud/retention" variant="secondary">
              Retention policy
            </ButtonLink>
            <ButtonLink href="/cloud/signer" variant="secondary">
              Server-side signer
            </ButtonLink>
          </div>
        }
      />

      <section>
        <h2 className="text-lg font-semibold">Available today</h2>
        <p className="mt-1 max-w-[70ch] text-sm text-muted">
          What you can use right now without any feature flag.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {FEATURES.filter((f) => f.status === "Available").map((f) => (
            <FeatureCard key={f.title} feature={f} />
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">
          Wired behind{" "}
          <code className="font-mono text-sm">FILEONCHAIN_CLOUD_EVIDENCE_ENABLED</code>
        </h2>
        <p className="mt-1 max-w-[70ch] text-sm text-muted">
          The backend, schema, and pages ship in this build. The routes and UI
          are not reachable for users until the flag is flipped on. Listed
          here so they are not mistaken for current ones.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {FEATURES.filter((f) => f.status === "Planned").map((f) => (
            <FeatureCard key={f.title} feature={f} />
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Portable export, independent verification</h2>
        <Card className="mt-4 p-5">
          <p className="text-sm leading-relaxed text-muted">
            Every Cloud-produced envelope is a standard protocol document;
            the reference verifier (
            <code className="font-mono text-xs">fileonchain verify</code>) checks
            it deterministically and locally with no FileOnChain service in
            the loop. The hosted pages run the same code —{" "}
            <Link href="/verify" className="text-primary underline underline-offset-2">
              paste one into the in-browser verifier
            </Link>{" "}
            and the report matches. If FileOnChain disappeared tomorrow,
            existing envelopes and their receipts would lose nothing.
          </p>
        </Card>
      </section>
    </CloudShell>
  );
}
