import type { Metadata } from "next";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import DonationsFeed from "@/components/donations/DonationsFeed";
import DonateButton from "@/components/donations/DonateButton";
import DonationImpactStrip from "@/components/donations/DonationImpactStrip";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { CopyButton } from "@/components/ui/CopyButton";

const TREASURY_ADDRESS = "0x0001Treasury0000000000000000000000";

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
    description:
      "Fund the public cache that keeps onchain files retrievable for everyone.",
    url: "/donations",
    type: "website",
  },
  // Without this, the root layout's twitter block (homepage copy) is
  // inherited wholesale — metadata merges shallowly per top-level key.
  twitter: {
    card: "summary_large_image",
    title: "Donations · FileOnChain",
    description:
      "Fund the public cache that keeps onchain files retrievable for everyone.",
  },
};

export default function DonationsPage() {
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
            <CardDescription>Most recent first.</CardDescription>
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
          <Card variant="outlined">
            <CardHeader>
              <CardTitle>Treasury</CardTitle>
              <CardDescription>DonationEscrow forwards here.</CardDescription>
            </CardHeader>
            <div className="flex items-center gap-1.5">
              <p className="font-mono text-xs text-muted break-all">{TREASURY_ADDRESS}</p>
              <CopyButton value={TREASURY_ADDRESS} ariaLabel="Copy treasury address" />
            </div>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}