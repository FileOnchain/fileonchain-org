import { PageShell } from "@/components/layout/PageShell";
import DonationsFeed from "@/components/donations/DonationsFeed";
import DonateButton from "@/components/donations/DonateButton";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";

export default function DonationsPage() {
  return (
    <PageShell size="wide" padding="lg">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            Donations
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">
            Support the public cache
          </h1>
          <p className="text-muted max-w-2xl">
            Donate to the platform, fund pinning for a specific CID, or back the public cache layer for a single chain.
          </p>
        </div>
        <DonateButton label="Donate now" variant="primary" size="md" />
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
            <ol className="space-y-2 text-sm text-muted list-decimal list-inside">
              <li>Pick a recipient tier — platform, a CID, or a chain.</li>
              <li>Enter amount + memo (optional).</li>
              <li>Submit a transaction through DonationEscrow.</li>
              <li>Treasury forwards funds to maintain the public cache.</li>
            </ol>
          </Card>
          <Card variant="outlined">
            <CardHeader>
              <CardTitle>Treasury</CardTitle>
            </CardHeader>
            <p className="font-mono text-xs text-muted break-all">
              0x0001Treasury0000000000000000000000
            </p>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}