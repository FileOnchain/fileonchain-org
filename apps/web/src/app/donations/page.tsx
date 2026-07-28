import type { Metadata } from "next";
import { CHAINS } from "@fileonchain/sdk";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import DonationsFeed from "@/components/donations/DonationsFeed";
import DonateButton from "@/components/donations/DonateButton";
import DonationImpactStrip from "@/components/donations/DonationImpactStrip";
import TreasuryAddressCard from "@/components/donations/TreasuryAddressCard";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  isDonationProvisioned,
  getTreasuryAddress,
} from "@/lib/server/donations";

// Direct RPC reads — must not be baked into a static render. Next.js
// would otherwise capture the first call's response and freeze it.
export const dynamic = "force-dynamic";

const HOW_IT_WORKS_STEPS = [
  "Pick a recipient tier — platform, a CID, or a chain.",
  "Enter amount + memo (optional).",
  "Submit a transaction through DonationEscrow.",
  "Treasury forwards funds to maintain the public cache.",
] as const;

export const metadata: Metadata = {
  title: "Donations",
  description:
    "Support FileOnChain's public cache. Donate to the platform, fund pinning for a specific CID, or back the public cache layer for a single chain.",
  alternates: { canonical: "/donations" },
  openGraph: {
    title: "Donations · FileOnChain",
    description: "Fund the public cache that keeps onchain files retrievable for everyone.",
    url: "/donations",
    type: "website",
  },
  // Without this, the root layout's twitter block (homepage copy) is
  // inherited wholesale — metadata merges shallowly per top-level key.
  twitter: {
    card: "summary_large_image",
    title: "Donations · FileOnChain",
    description: "Fund the public cache that keeps onchain files retrievable for everyone.",
  },
};

/**
 * DonationsPage — server component. The treasury card list resolves
 * one card per provisioned EVM chain from `DonationEscrow.treasury()`;
 * each chain can forward to a different treasury, so we render all of
 * them rather than picking an arbitrary first chain. Read failures
 * surface as "Address unavailable" — never fabricate a hex.
 */
export default async function DonationsPage() {
  const provisionedChains = CHAINS.filter(isDonationProvisioned);
  const treasuryByChain = await Promise.all(
    provisionedChains.map(async (chain) => ({
      chain: { id: chain.id, name: chain.name, shortName: chain.shortName },
      address: await getTreasuryAddress(chain.id),
    })),
  );

  return (
    <PageShell size="wide" padding="lg" atmosphere>
      <PageHeader
        className="mb-8"
        index="04"
        kicker="Public infrastructure"
        title="Keep the public cache alive."
        lede="Donate to the platform, fund pinning for a specific CID, or back the public cache layer for a single chain. Every contribution keeps anchored files retrievable for everyone."
        actions={<DonateButton label="Donate now" variant="primary" size="md" />}
      />

      <div className="mb-8">
        <DonationImpactStrip />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent donations</CardTitle>
          </CardHeader>
          <DonationsFeed />
        </Card>

        <div className="space-y-4">
          <Card variant="outlined">
            <CardHeader>
              <CardTitle>How donations work</CardTitle>
            </CardHeader>
            <ol className="space-y-3">
              {HOW_IT_WORKS_STEPS.map((step, i) => (
                <li key={step} className="flex items-start gap-3 text-sm text-muted">
                  <span className="mt-0.5 font-mono text-[10px] font-semibold tracking-widest text-primary">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </Card>
          {treasuryByChain.map(({ chain, address }) => (
            <TreasuryAddressCard
              key={chain.id}
              chain={chain}
              address={address}
            />
          ))}
        </div>
      </div>
    </PageShell>
  );
}