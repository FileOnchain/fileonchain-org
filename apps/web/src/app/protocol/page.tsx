import type { Metadata } from "next";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { siteConfig } from "@/lib/site";
import {
  MOCK_PLATFORMS,
  MOCK_PROTOCOL_STATS,
  MOCK_VALIDATORS,
} from "@/lib/mock/protocol";

export const metadata: Metadata = {
  title: "Protocol",
  description:
    "How FileOnChain's optimistic anchor protocol works: propose with a FOC tip and bond, a challenge window, staked validator juries, and a 60/25/15 fee split between validators, platforms, and the protocol treasury.",
  alternates: { canonical: `${siteConfig.url}/protocol` },
};

const shortAddress = (address: string): string => `${address.slice(0, 8)}…${address.slice(-6)}`;

const STEPS = [
  {
    title: "1 · Propose",
    body: "A file-level anchor escrows a FOC tip plus a propose bond and names the originating platform (the app, a partner API, an MCP client). Chunk anchors stay free — only the file CID enters the protocol.",
  },
  {
    title: "2 · Challenge window",
    body: "For 24 hours anyone can challenge the proposal with a counter-bond. Most anchors are honest, so most sail through untouched — that is the optimistic fast path.",
  },
  {
    title: "3 · Verify (fast path)",
    body: "After the window anyone may finalize: the anchor becomes Verified — first verified wins per CID — the bond returns, and the tip splits 60% to staked validators, 25% to the originating platform's treasury, and 15% to the protocol treasury.",
  },
  {
    title: "4 · Dispute (slow path)",
    body: "A challenge draws a five-member jury at random from the staked validator set. The majority decides; the losing side's bond is slashed to the winners, jurors who voted with the losing side are slashed from stake, and ties default to the optimistic outcome.",
  },
] as const;

const GOVERNANCE_POINTS = [
  "The FOC token votes through an on-chain Governor + timelock on EVM: fee split, platform caps and registration, bonds, tip minimums, windows, jury parameters, validator stake minimums, and treasury spends.",
  "The timelock is the protocol treasury — spending tip revenue is itself a governance proposal.",
  "Aptos, Sui, Starknet, and NEAR run the same protocol with parameters held by an admin account that executes EVM governance decisions.",
  "Governance decides protocol rules, never per-file outcomes — individual anchors are settled by the optimistic window and staked juries.",
] as const;

/**
 * /protocol — how the propose/verify anchor protocol works, plus read-only
 * validator and platform tables. Data comes from the mock protocol layer
 * (TODO: real ValidatorStaking / PlatformRegistry reads); interactive
 * staking and dispute voting ship separately.
 */
const ProtocolPage = () => {
  const stats = MOCK_PROTOCOL_STATS;
  const split = stats.feeSplit;
  return (
    <PageShell>
      <PageHeader
        index="07"
        kicker="Verification market"
        title="The anchor protocol"
        lede="Anchors are verified claims, not just transactions: every file anchor posts a FOC tip and a bond, survives a challenge window policed by staked validators, and pays the network that verified it."
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "FOC staked", value: stats.totalStakedFoc.toLocaleString() },
          { label: "Active validators", value: String(stats.activeValidators) },
          { label: "Anchors verified", value: stats.proposalsVerified.toLocaleString() },
          { label: "Disputes resolved", value: String(stats.disputesResolved) },
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <p className="text-sm text-muted">{stat.label}</p>
            <p className="mt-1 text-2xl font-semibold">{stat.value}</p>
          </Card>
        ))}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">How an anchor verifies</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {STEPS.map((step) => (
            <Card key={step.title} className="p-5">
              <h3 className="font-medium">{step.title}</h3>
              <p className="mt-2 text-sm text-muted">{step.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">The fee split</h2>
        <Card className="mt-4 p-5">
          <div className="flex h-4 w-full overflow-hidden rounded-full" aria-hidden>
            <div className="bg-success" style={{ width: `${split.validatorBps / 100}%` }} />
            <div className="bg-warning" style={{ width: `${split.platformBps / 100}%` }} />
            <div className="bg-accent" style={{ width: `${split.protocolBps / 100}%` }} />
          </div>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <p>
              <span className="font-medium">{split.validatorBps / 100}% validators</span>
              <span className="block text-muted">pro-rata across active stake</span>
            </p>
            <p>
              <span className="font-medium">{split.platformBps / 100}% platform</span>
              <span className="block text-muted">the integrator that originated the anchor</span>
            </p>
            <p>
              <span className="font-medium">{split.protocolBps / 100}% protocol</span>
              <span className="block text-muted">treasury governed by FOC holders</span>
            </p>
          </div>
        </Card>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Governance</h2>
        <ul className="mt-4 space-y-2 text-sm text-muted">
          {GOVERNANCE_POINTS.map((point) => (
            <li key={point} className="flex gap-2">
              <span aria-hidden className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              {point}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Validators</h2>
        <p className="mt-1 text-sm text-muted">
          Validators stake FOC to join the verification market: they earn the validator share of
          every tip and sit on dispute juries, where voting with the losing side is slashed.
          Mock data until deployments land; staking UI ships separately.
        </p>
        <Card className="mt-4 overflow-x-auto p-0">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-border text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Validator</th>
                <th className="px-4 py-3 font-medium">Stake (FOC)</th>
                <th className="px-4 py-3 font-medium">Rewards (FOC)</th>
                <th className="px-4 py-3 font-medium">Jury duties</th>
                <th className="px-4 py-3 font-medium">Slashes</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_VALIDATORS.map((validator) => (
                <tr key={validator.address} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{shortAddress(validator.address)}</td>
                  <td className="px-4 py-3">{validator.stake.toLocaleString()}</td>
                  <td className="px-4 py-3">{validator.rewardsEarned.toLocaleString()}</td>
                  <td className="px-4 py-3">{validator.juryDuties}</td>
                  <td className="px-4 py-3">{validator.slashes}</td>
                  <td className="px-4 py-3">
                    <Badge variant={validator.active ? "success" : "warning"} size="sm">
                      {validator.active ? "active" : "below min stake"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Platforms</h2>
        <p className="mt-1 text-sm text-muted">
          Registered integrators earn the platform share of every anchor they originate — the
          FileOnChain app, partner APIs, and MCP clients all attribute uploads to their platform
          id. Registration is governance-gated.
        </p>
        <Card className="mt-4 overflow-x-auto p-0">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-border text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Id</th>
                <th className="px-4 py-3 font-medium">Platform</th>
                <th className="px-4 py-3 font-medium">Fee share</th>
                <th className="px-4 py-3 font-medium">Anchors originated</th>
                <th className="px-4 py-3 font-medium">Revenue (FOC)</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_PLATFORMS.map((platform) => (
                <tr key={platform.platformId} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{platform.platformId}</td>
                  <td className="px-4 py-3">{platform.name}</td>
                  <td className="px-4 py-3">{platform.feeBps / 100}%</td>
                  <td className="px-4 py-3">{platform.anchorsOriginated.toLocaleString()}</td>
                  <td className="px-4 py-3">{platform.revenueFoc.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <Badge variant={platform.active ? "success" : "danger"} size="sm">
                      {platform.active ? "active" : "inactive"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </PageShell>
  );
};

export default ProtocolPage;
