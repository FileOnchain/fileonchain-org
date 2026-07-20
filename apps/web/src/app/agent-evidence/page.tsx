import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Agent Evidence",
  description:
    "Tamper-evident audit trails for AI agents: seal agent runs, outputs, tool calls, and approvals into portable evidence packages under the Agent Evidence Profile — hash-only by default, independently verifiable.",
  alternates: { canonical: `${siteConfig.url}/agent-evidence` },
  openGraph: {
    title: "Agent Evidence · FileOnChain",
    description:
      "Seal agent runs, outputs, tool calls, and approvals into portable evidence packages anyone can verify locally.",
    url: "/agent-evidence",
    type: "website",
  },
  // Without this, the root layout's twitter block (homepage copy) is
  // inherited wholesale — metadata merges shallowly per top-level key.
  twitter: {
    card: "summary_large_image",
    title: "Agent Evidence · FileOnChain",
    description:
      "Seal agent runs, outputs, tool calls, and approvals into portable evidence packages anyone can verify locally.",
  },
};

/* ------------------------------------------------------------------ */
/* Content data                                                        */
/* ------------------------------------------------------------------ */

const SEALED_THINGS = [
  {
    title: "Agent runs",
    claim: "runId · agentId — required",
    body: "Every envelope under the Agent Evidence Profile names the run and the agent that produced it, with optional session, parent run, organization, environment, timing, and completion status.",
  },
  {
    title: "Output artifacts",
    claim: "subject digests",
    body: "The envelope's subject is the thing itself — a report, generated code, a decision record — bound by SHA-256. Model metadata travels as digests: config digest, prompt digest, template id.",
  },
  {
    title: "Tool call activity",
    claim: "toolCalls[] — input/output digests",
    body: "Each tool call records its name, version, status, and SHA-256 digests of its input and output — plus an optional reference to the external trace (OpenTelemetry span, Langfuse trace) it came from.",
  },
  {
    title: "Approvals & policy",
    claim: "approvals[] · policy",
    body: "Human reviews, policy gates, and sign-offs record who approved what (by digest), under which policy, and — when backed by a cryptographic signature — point at the artifact signature that proves it.",
  },
] as const;

const CLOUD_FEATURES = [
  {
    title: "Managed anchoring with credits",
    body: "POST an artifact hash to the hosted API with a fok_ key; a funded worker settles it on the network you chose and returns the receipts. Pay with account credits — no wallets or gas handling in your agent.",
    status: "Available",
    live: true,
  },
  {
    title: "API keys, jobs & activity history",
    body: "Scoped API keys, job polling for anchor requests, and a dashboard of everything your keys have sealed.",
    status: "Available",
    live: true,
  },
  {
    title: "Retention & search",
    body: "Managed retention of your envelopes and search across runs, agents, and sessions.",
    status: "Planned",
    live: false,
  },
  {
    title: "Hosted verification pages",
    body: "Shareable per-envelope verification pages for counterparties who won't run a CLI. The local verifier remains the ground truth — hosted pages are a convenience, never a requirement.",
    status: "Planned",
    live: false,
  },
] as const;

const CODE_SAMPLE = `import { sealAgentRun } from "@fileonchain/sdk/evidence";

const envelope = await sealAgentRun({
  subjectBytes: reportBytes, // the agent's output artifact
  subjectMeta: { name: "quarterly-report.md", mediaType: "text/markdown" },
  run: {
    runId: "run_01J9X4T7",
    agentId: "agent://acme/research-analyst",
    model: { id: "claude-sonnet-4-5", promptDigest }, // digests, not prompts
    toolCalls: [
      { name: "web_search", inputDigest, outputDigest, status: "success" },
    ],
    approvals: [{ approverId: "user:maya", type: "human-review" }],
    status: "completed",
  },
  signers: [agentSigner], // agent key, wallet, or organization key
});
// → one portable evidence envelope: anchor it, then hand it over.`;

/**
 * /agent-evidence — the commercial use-case page: tamper-evident audit
 * trails for AI agents, built on the Agent Evidence Profile of the open
 * FileOnChain Evidence Protocol. Server component: static prose + code.
 */
const AgentEvidencePage = () => (
  <PageShell size="wide" padding="lg" atmosphere>
    <PageHeader
      className="mb-8"
      index="02"
      kicker="Agent Evidence"
      title="Tamper-evident audit trails for AI agents"
      lede="The Agent Evidence Profile seals what an agent did — the run, its outputs, its tool calls, its approvals — into one portable evidence envelope. Hash-only by default, signed by the keys involved, settled on public systems, and verifiable by anyone with the open local verifier."
      actions={
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/#dropzone">Create evidence →</ButtonLink>
          <ButtonLink href="/verify" variant="secondary">
            Verify a package →
          </ButtonLink>
        </div>
      }
    />

    {/* What gets sealed ------------------------------------------------ */}
    <section>
      <h2 className="text-lg font-semibold">What gets sealed</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-muted">
        The profile maps agent activity to namespaced claims under{" "}
        <code className="font-mono text-xs">org.fileonchain.agent</code> —{" "}
        <code className="font-mono text-xs">runId</code> and{" "}
        <code className="font-mono text-xs">agentId</code> are required; everything else is
        opt-in and digest-based.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {SEALED_THINGS.map((item) => (
          <Card key={item.title} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-medium">{item.title}</h3>
              <code className="shrink-0 font-mono text-[10px] text-primary">{item.claim}</code>
            </div>
            <p className="mt-2 text-sm text-muted">{item.body}</p>
          </Card>
        ))}
      </div>
    </section>

    {/* Privacy mode ---------------------------------------------------- */}
    <section className="mt-10">
      <h2 className="text-lg font-semibold">Hash-only by default</h2>
      <Card className="mt-4 p-5">
        <p className="text-sm leading-relaxed text-muted">
          Raw prompts and artifact bytes are{" "}
          <span className="font-medium text-foreground">never required</span>. The profile
          references and hashes: a prompt travels as its SHA-256 digest, a tool output as its
          digest, an observability trace as a reference plus a digest. What leaves your
          infrastructure is evidence <em>about</em> the run — not the run&apos;s content.
          Anyone who later holds the real bytes can recompute the digests and prove they match;
          anyone who doesn&apos;t sees nothing sensitive. Storing bytes (on a storage system or
          an external URI you host) is an explicit, per-artifact opt-in.
        </p>
      </Card>
    </section>

    {/* Code sample ------------------------------------------------------ */}
    <section className="mt-10">
      <h2 className="text-lg font-semibold">Seal a run in one call</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-muted">
        <code className="font-mono text-xs">sealAgentRun</code> from{" "}
        <code className="font-mono text-xs">@fileonchain/sdk/evidence</code> derives the subject
        from bytes, stamps the profile, collects artifact signatures, and returns a finalized
        envelope ready for receipts.
      </p>
      <Card className="mt-4 overflow-x-auto p-0">
        <pre className="p-5 font-mono text-xs leading-relaxed text-foreground">
          <code>{CODE_SAMPLE}</code>
        </pre>
      </Card>
    </section>

    {/* Manifests -------------------------------------------------------- */}
    <section className="mt-10">
      <h2 className="text-lg font-semibold">One settlement transaction per session</h2>
      <Card className="mt-4 p-5">
        <p className="text-sm leading-relaxed text-muted">
          Agent sessions produce many small artifacts, and one settlement transaction each would
          be wasteful. A <span className="font-medium text-foreground">signed manifest</span>{" "}
          lists a session&apos;s artifacts, a Merkle tree over their digests reduces the batch to
          one root, and a single transaction settles the root — while each artifact&apos;s
          envelope carries its own inclusion proof back to it. Anchoring a manifest per session
          is the recommended default for agent workloads.
        </p>
      </Card>
    </section>

    {/* Cloud ------------------------------------------------------------ */}
    <section className="mt-10">
      <h2 className="text-lg font-semibold">FileOnChain Cloud — the convenient way to run it</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-muted">
        Everything above works self-managed: your keys, your RPC endpoints, the open-source SDK.
        The hosted product removes the operational work — honestly labeled by what&apos;s live
        today.
      </p>
      <p className="mt-3 max-w-[70ch] text-xs text-muted">
        The <Badge variant="warning" size="sm">Planned</Badge> entries below are wired and gated
        behind <code className="font-mono text-[11px]">FILEONCHAIN_CLOUD_EVIDENCE_ENABLED</code>;
        the schema, routes, services, and pages ship in this build but the surfaces are not
        reachable for users until the flag is on. See{" "}
        <Link href="/cloud" className="text-primary underline underline-offset-2">
          the Cloud landing
        </Link>{" "}
        for the full inventory.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {CLOUD_FEATURES.map((item) => (
          <Card key={item.title} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-medium">{item.title}</h3>
              <Badge variant={item.live ? "success" : "warning"} size="sm">
                {item.status}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted">{item.body}</p>
          </Card>
        ))}
      </div>
    </section>

    {/* Portable export + verification ----------------------------------- */}
    <section className="mt-10">
      <h2 className="text-lg font-semibold">Portable export, independent verification</h2>
      <Card className="mt-4 p-5">
        <p className="text-sm leading-relaxed text-muted">
          The output is always a file — an evidence envelope you can export, archive, or hand to
          an auditor, a customer, or a regulator. They verify it without a FileOnChain account:
          paste it into the{" "}
          <Link href="/verify" className="text-primary underline underline-offset-2">
            in-browser verifier
          </Link>{" "}
          or run{" "}
          <code className="font-mono text-xs">fileonchain verify evidence.json</code> locally.
          The checks — subject integrity, artifact and envelope signatures, receipts, key status
          — are defined by the{" "}
          <Link href="/protocol" className="text-primary underline underline-offset-2">
            open protocol
          </Link>
          , not by us.
        </p>
      </Card>
    </section>
  </PageShell>
);

export default AgentEvidencePage;
