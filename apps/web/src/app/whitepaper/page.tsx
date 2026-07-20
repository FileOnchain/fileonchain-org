import * as React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

export const metadata: Metadata = {
  title: "Documents",
  description:
    "The FileOnChain document set: the neutral Evidence Protocol specification, the Agent Evidence Profile, the FileOnChain Cloud product overview, the integration status ledger, and the architecture decision records.",
  alternates: { canonical: "/whitepaper" },
  openGraph: {
    title: "Documents · FileOnChain",
    description:
      "Protocol spec, Agent Evidence Profile, Cloud overview, integration status, and ADRs — the neutral protocol, the opinionated profile, the convenient product.",
    url: "/whitepaper",
    type: "article",
  },
  // Without this, the root layout's twitter block (homepage copy) is
  // inherited wholesale — metadata merges shallowly per top-level key.
  twitter: {
    card: "summary_large_image",
    title: "Documents · FileOnChain",
    description:
      "Protocol spec, Agent Evidence Profile, Cloud overview, integration status, and ADRs — the neutral protocol, the opinionated profile, the convenient product.",
  },
};

const GITHUB_REPO = "https://github.com/FileOnchain/fileonchain-org";

const PRINCIPLE_LAYERS = [
  {
    title: "The protocol is neutral",
    body: "The FileOnChain Evidence Protocol defines the envelope — subject, claims, signatures, receipts — and nothing about how you must use it. Anyone can implement it without FileOnChain's packages or services.",
  },
  {
    title: "The application profile is opinionated",
    body: "The Agent Evidence Profile decides what agent evidence must contain — run and agent identifiers, digest-based model metadata, tool calls, approvals, policies — and how it validates.",
  },
  {
    title: "The hosted product is convenient",
    body: "FileOnChain Cloud handles keys, credits, anchoring workers, and retention so your agents don't have to. It is never required: every envelope it produces verifies locally, without an account.",
  },
] as const;

const GITHUB_DOCS = [
  {
    title: "Evidence Protocol — normative spec",
    href: `${GITHUB_REPO}/blob/main/docs/protocol/evidence-protocol.md`,
    tag: "Protocol",
    body: "The envelope format, canonical encoding, artifact and envelope signatures, receipt adapters, and profile registration — the document an independent implementation follows.",
  },
  {
    title: "Agent Evidence Profile v1",
    href: `${GITHUB_REPO}/blob/main/docs/profiles/agent-evidence-v1.md`,
    tag: "Profile",
    body: "The org.fileonchain.agent claims — required run and agent identifiers, model digests, tool calls, approvals, policy, trace references — and their validation rules.",
  },
  {
    title: "FileOnChain Cloud — product overview",
    href: `${GITHUB_REPO}/blob/main/docs/product/fileonchain-cloud.md`,
    tag: "Product",
    body: "What the hosted product does on top of the protocol: managed anchoring with credits, API keys, and the honest split between what is available and what is planned.",
  },
  {
    title: "Integration status ledger",
    href: `${GITHUB_REPO}/blob/main/docs/integrations/status.md`,
    tag: "Status",
    body: "The source-of-truth status ladder for every storage and settlement system — mirrored live by the in-app integrations page.",
  },
  {
    title: "Architecture decision records",
    href: `${GITHUB_REPO}/tree/main/docs/adr`,
    tag: "ADRs",
    body: "Why the design is the way it is — the separation into protocol, profile, and product, and the decisions behind each layer, recorded as they were made.",
  },
] as const;

const IN_APP_PAGES = [
  {
    title: "Protocol",
    href: "/protocol",
    body: "The envelope, both signature sets, receipt adapters, profiles — and what cannot be verified.",
  },
  {
    title: "Agent Evidence",
    href: "/agent-evidence",
    body: "The commercial use case: tamper-evident audit trails for AI agents, sealed with one SDK call.",
  },
] as const;

const linkCard =
  "block h-full rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/**
 * /whitepaper — the compact "Documents" index. The long-form paper moved
 * into the repository as separate normative documents (protocol spec,
 * profile, product overview, ADRs); this route survives because inbound
 * links exist, and now maps the document set instead of duplicating it.
 */
const DocumentsPage = () => (
  <PageShell size="wide" padding="lg" atmosphere>
    <PageHeader
      className="mb-8"
      index="08"
      kicker="Documents"
      title="The protocol, the profile, the product"
      lede="FileOnChain is deliberately layered: a neutral evidence protocol anyone can implement, an opinionated application profile for AI-agent evidence, and a hosted product that makes running it convenient. Each layer has its own document — this page maps them."
    />

    {/* The three-layer principle ---------------------------------------- */}
    <section>
      <h2 className="text-lg font-semibold">One principle, three layers</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-muted">
        The protocol is neutral. The application profile is opinionated. The hosted product is
        convenient. Nothing in the outer layers is required to verify what the inner layers
        produce.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {PRINCIPLE_LAYERS.map((layer) => (
          <Card key={layer.title} className="p-5">
            <h3 className="font-medium">{layer.title}</h3>
            <p className="mt-2 text-sm text-muted">{layer.body}</p>
          </Card>
        ))}
      </div>
    </section>

    {/* Normative documents on GitHub ------------------------------------ */}
    <section className="mt-10">
      <h2 className="text-lg font-semibold">The documents</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-muted">
        Canonical markdown in the repository — versioned, reviewable, and independent of this
        site.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {GITHUB_DOCS.map((doc) => (
          <a
            key={doc.href}
            href={doc.href}
            target="_blank"
            rel="noopener noreferrer"
            className={linkCard}
          >
            <Card interactive className="h-full p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-medium">{doc.title}</h3>
                <Badge variant="outline" size="sm">
                  {doc.tag}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-muted">{doc.body}</p>
              <p className="mt-3 font-mono text-[11px] text-primary">GitHub ↗</p>
            </Card>
          </a>
        ))}
      </div>
    </section>

    {/* In-app companions ------------------------------------------------- */}
    <section className="mt-10">
      <h2 className="text-lg font-semibold">Read them in the app</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {IN_APP_PAGES.map((page) => (
          <Link key={page.href} href={page.href} className={linkCard}>
            <Card interactive className="h-full p-5">
              <h3 className="font-medium">{page.title}</h3>
              <p className="mt-2 text-sm text-muted">{page.body}</p>
              <p className="mt-3 font-mono text-[11px] text-primary">{page.href} →</p>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  </PageShell>
);

export default DocumentsPage;
