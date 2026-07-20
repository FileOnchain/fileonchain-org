import type { Metadata } from "next";
import Link from "next/link";
import {
  CHAINS,
  CHAIN_FAMILY_LABELS,
  CHAIN_STATUS_LABELS,
  INTEGRATION_STATUS_LABELS,
  getIntegrationStatus,
  isStorageCapable,
  isChainActive,
  type ChainConfig,
} from "@fileonchain/sdk";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Integrations",
  description:
    "Honest integration status for every system FileOnChain touches: storage and settlement networks straight from the chain registry, plus planned agent-framework and observability integrations.",
  alternates: { canonical: `${siteConfig.url}/integrations` },
  openGraph: {
    title: "Integrations · FileOnChain",
    description:
      "Storage and settlement systems with their real integration status — plus planned agent-framework and observability integrations.",
    url: "/integrations",
    type: "website",
  },
  // Without this, the root layout's twitter block (homepage copy) is
  // inherited wholesale — metadata merges shallowly per top-level key.
  twitter: {
    card: "summary_large_image",
    title: "Integrations · FileOnChain",
    description:
      "Storage and settlement systems with their real integration status — plus planned agent-framework and observability integrations.",
  },
};

/* ------------------------------------------------------------------ */
/* Registry-driven network tables                                      */
/* ------------------------------------------------------------------ */

const STORAGE_SYSTEMS = CHAINS.filter(isStorageCapable);
const SETTLEMENT_SYSTEMS = CHAINS.filter((chain) => !isStorageCapable(chain));

const PLANNED_AGENT_FRAMEWORKS = [
  {
    name: "OpenAI Agents",
    body: "Seal run outputs and tool-call digests straight from an agent-framework hook.",
  },
  {
    name: "MCP",
    body: "The FileOnChain MCP server already anchors via the hosted API; profile-aware sealing of MCP tool activity is next.",
  },
] as const;

const PLANNED_OBSERVABILITY = [
  {
    name: "OpenTelemetry",
    body: "Reference and hash exported spans as trace claims — the trace stays in your collector; its digest travels in the envelope.",
  },
  {
    name: "Langfuse",
    body: "Import a trace by reference and digest, per the Agent Evidence Profile's traceRefs.",
  },
  {
    name: "LangSmith",
    body: "Same referenced/hashed trace import — evidence about the run, never a copy of it.",
  },
] as const;

const integrationBadgeVariant = (chain: ChainConfig) => {
  const status = getIntegrationStatus(chain);
  return status === "webapp-integrated" || status === "production-ready" || status === "audited"
    ? ("success" as const)
    : status === "testnet-deployed" || status === "mainnet-deployed"
      ? ("info" as const)
      : ("warning" as const);
};

const NetworkTable = ({ chains }: { chains: readonly ChainConfig[] }) => (
  <div className="mt-4 overflow-x-auto rounded-lg border border-border">
    <table className="w-full min-w-[720px] text-left text-sm">
      <thead>
        <tr className="border-b border-border bg-surface-elevated/60">
          {["Network", "Family", "Availability", "Integration status"].map((h) => (
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
        {chains.map((chain) => (
          <tr key={chain.id} className="border-b border-border last:border-b-0">
            <td className="px-4 py-2.5 font-medium text-foreground">
              {chain.name}
              {chain.testnet && (
                <span className="ml-2 font-mono text-[10px] uppercase text-muted">testnet</span>
              )}
            </td>
            <td className="px-4 py-2.5 text-muted">{CHAIN_FAMILY_LABELS[chain.family]}</td>
            <td className="whitespace-nowrap px-4 py-2.5">
              <Badge variant={isChainActive(chain) ? "success" : "outline"} size="sm">
                {CHAIN_STATUS_LABELS[chain.status]}
              </Badge>
            </td>
            <td className="whitespace-nowrap px-4 py-2.5">
              <Badge variant={integrationBadgeVariant(chain)} size="sm">
                {INTEGRATION_STATUS_LABELS[getIntegrationStatus(chain)]}
              </Badge>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/**
 * /integrations — the honest status page, generated from the chain registry
 * (packages/utils/src/chains.ts), never from marketing copy. Storage systems
 * can hold the bytes; settlement systems fix a hash in time. Agent-framework
 * and observability integrations are listed as exactly what they are: planned.
 */
const IntegrationsPage = () => (
  <PageShell size="wide" padding="lg" atmosphere>
    <PageHeader
      className="mb-8"
      index="10"
      kicker="Integrations"
      title="Every system, with its real status"
      lede="This page is generated from the chain registry — the same flags the SDK and the anchoring API enforce. A network is never described beyond its integration status, and planned integrations are labeled planned."
    />

    <section>
      <h2 className="text-lg font-semibold">Storage systems</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-muted">
        Networks whose transactions can carry chunk bytes — where an artifact&apos;s content can
        optionally live on-chain. Storage is always an explicit opt-in; hash-only evidence is the
        default.
      </p>
      <NetworkTable chains={STORAGE_SYSTEMS} />
    </section>

    <section className="mt-10">
      <h2 className="text-lg font-semibold">Settlement systems</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-muted">
        Networks where a hash or Merkle root is fixed in time for the system&apos;s ordinary
        transaction fee. Each settlement receipt is an independent, system-native attestation —
        several of them make the evidence portable, not &ldquo;more proven.&rdquo;
      </p>
      <NetworkTable chains={SETTLEMENT_SYSTEMS} />
    </section>

    <section className="mt-10">
      <h2 className="text-lg font-semibold">Agent frameworks</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-muted">
        Planned integrations that seal evidence from inside agent runtimes, per the{" "}
        <Link href="/agent-evidence" className="text-primary underline underline-offset-2">
          Agent Evidence Profile
        </Link>
        .
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {PLANNED_AGENT_FRAMEWORKS.map((item) => (
          <Card key={item.name} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-medium">{item.name}</h3>
              <Badge variant="warning" size="sm">
                Planned
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted">{item.body}</p>
          </Card>
        ))}
      </div>
    </section>

    <section className="mt-10">
      <h2 className="text-lg font-semibold">Observability platforms</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-muted">
        FileOnChain complements tracing systems rather than replacing them: traces are imported
        by reference and digest — the observability platform stays the system of record.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {PLANNED_OBSERVABILITY.map((item) => (
          <Card key={item.name} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-medium">{item.name}</h3>
              <Badge variant="warning" size="sm">
                Planned
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted">{item.body}</p>
          </Card>
        ))}
      </div>
    </section>
  </PageShell>
);

export default IntegrationsPage;
