"use client";

import * as React from "react";
import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import LeaderboardTable from "@/components/leaderboard/LeaderboardTable";
import ValidatorBoard from "@/components/leaderboard/ValidatorBoard";
import PlatformBoard from "@/components/leaderboard/PlatformBoard";
import HolderBoard from "@/components/leaderboard/HolderBoard";
import { StatCounter } from "@/components/LiveLedgerTicker";
import { formatBytes } from "@/lib/cid/format";
import { cn } from "@/lib/cn";
import type { PublicProfile } from "@/lib/mock/profiles";
import type {
  MockFocatHolder,
  MockPlatform,
  MockValidator,
} from "@/lib/mock/protocol";

type BoardKey = "uploaders" | "validators" | "platforms" | "holders";

const BOARD_TABS: Array<{ key: BoardKey; label: string }> = [
  { key: "uploaders", label: "Uploaders" },
  { key: "validators", label: "Validators" },
  { key: "platforms", label: "Platforms" },
  { key: "holders", label: "FOCAT holders" },
];

/* ----------------------------------------------------------------------------
 * Per-board sorting
 * --------------------------------------------------------------------------- */

type UploaderSort = "anchors" | "bytes" | "donated";
type ValidatorSort = "stake" | "rewards" | "juries";
type PlatformSort = "anchors" | "revenue";
type HolderSort = "holdings" | "votes";

const UPLOADER_SORTS: Array<{ key: UploaderSort; label: string }> = [
  { key: "anchors", label: "Most anchors" },
  { key: "bytes", label: "Most bytes" },
  { key: "donated", label: "Top donors" },
];

const VALIDATOR_SORTS: Array<{ key: ValidatorSort; label: string }> = [
  { key: "stake", label: "Most staked" },
  { key: "rewards", label: "Most rewards" },
  { key: "juries", label: "Most jury duties" },
];

const PLATFORM_SORTS: Array<{ key: PlatformSort; label: string }> = [
  { key: "anchors", label: "Most anchors originated" },
  { key: "revenue", label: "Most revenue" },
];

const HOLDER_SORTS: Array<{ key: HolderSort; label: string }> = [
  { key: "holdings", label: "Largest holdings" },
  { key: "votes", label: "Most voting power" },
];

const sortProfiles = (profiles: PublicProfile[], sort: UploaderSort): PublicProfile[] =>
  [...profiles]
    .sort((a, b) => {
      switch (sort) {
        case "bytes":
          return b.stats.bytes - a.stats.bytes;
        case "donated":
          return b.stats.donatedUsdc - a.stats.donatedUsdc;
        default:
          return b.stats.anchors - a.stats.anchors;
      }
    })
    .map((p, i) => ({ ...p, rank: i + 1 }));

const sortValidators = (validators: MockValidator[], sort: ValidatorSort): MockValidator[] =>
  [...validators].sort((a, b) => {
    switch (sort) {
      case "rewards":
        return b.rewardsEarned - a.rewardsEarned;
      case "juries":
        return b.juryDuties - a.juryDuties;
      default:
        return b.stake - a.stake;
    }
  });

const sortPlatforms = (platforms: MockPlatform[], sort: PlatformSort): MockPlatform[] =>
  [...platforms].sort((a, b) =>
    sort === "revenue"
      ? b.revenueFoc - a.revenueFoc
      : b.anchorsOriginated - a.anchorsOriginated,
  );

const sortHolders = (holders: MockFocatHolder[], sort: HolderSort): MockFocatHolder[] =>
  [...holders].sort((a, b) =>
    sort === "votes"
      ? b.votingPower - a.votingPower
      : b.balance + b.staked - (a.balance + a.staked),
  );

/* ----------------------------------------------------------------------------
 * Small shared pieces
 * --------------------------------------------------------------------------- */

const SortChips = <K extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ key: K; label: string }>;
  value: K;
  onChange: (key: K) => void;
}) => (
  <div className="mb-4 flex flex-wrap items-center gap-2">
    <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
      Rank by
    </span>
    {options.map(({ key, label }) => (
      <button
        key={key}
        type="button"
        onClick={() => onChange(key)}
        aria-pressed={value === key}
        className={cn(
          "rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-base",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          value === key
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-surface text-muted hover:border-primary/40 hover:text-foreground",
        )}
      >
        {label}
      </button>
    ))}
  </div>
);

const TotalsStrip = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-8 grid grid-cols-1 gap-6 rounded-2xl border border-border bg-surface p-6 sm:grid-cols-3 sm:gap-8">
    {children}
  </div>
);

const BoardFootnote = ({ children }: { children: React.ReactNode }) => (
  <section className="mt-12 rounded-2xl border border-dashed border-border bg-surface/60 p-5 text-sm text-muted">
    <p>{children}</p>
  </section>
);

const LoadingRows = () => (
  <div className="space-y-2">
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="h-16 animate-pulse rounded-lg border border-border bg-surface" />
    ))}
  </div>
);

/**
 * LeaderboardShell — one board per role in the verification market: uploaders
 * anchoring data, validators verifying it, platforms originating it, and
 * FOCAT holders governing it. Uploader data comes from the mock profile layer
 * and the protocol boards from the mock protocol layer (TODO: real indexer +
 * ValidatorStaking / PlatformRegistry / FOCAT reads).
 */
const LeaderboardShell = () => {
  const [board, setBoard] = React.useState<BoardKey>("uploaders");
  const [profiles, setProfiles] = React.useState<PublicProfile[]>([]);
  const [validators, setValidators] = React.useState<MockValidator[]>([]);
  const [platforms, setPlatforms] = React.useState<MockPlatform[]>([]);
  const [holders, setHolders] = React.useState<MockFocatHolder[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [uploaderSort, setUploaderSort] = React.useState<UploaderSort>("anchors");
  const [validatorSort, setValidatorSort] = React.useState<ValidatorSort>("stake");
  const [platformSort, setPlatformSort] = React.useState<PlatformSort>("anchors");
  const [holderSort, setHolderSort] = React.useState<HolderSort>("holdings");

  React.useEffect(() => {
    let cancelled = false;
    // Dynamic imports keep the mock layers (and their viem dependency) out of
    // the initial bundle, matching how the rest of the app loads chain code.
    void Promise.all([
      import("@/lib/mock/profiles").then((mod) => mod.getLeaderboard()),
      import("@/lib/mock/protocol"),
    ]).then(([boardProfiles, protocol]) => {
      if (cancelled) return;
      setProfiles(boardProfiles);
      setValidators(protocol.MOCK_VALIDATORS);
      setPlatforms(protocol.MOCK_PLATFORMS);
      setHolders(protocol.MOCK_FOCAT_HOLDERS);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const rankedProfiles = React.useMemo(
    () => sortProfiles(profiles, uploaderSort),
    [profiles, uploaderSort],
  );
  const rankedValidators = React.useMemo(
    () => sortValidators(validators, validatorSort),
    [validators, validatorSort],
  );
  const rankedPlatforms = React.useMemo(
    () => sortPlatforms(platforms, platformSort),
    [platforms, platformSort],
  );
  const rankedHolders = React.useMemo(
    () => sortHolders(holders, holderSort),
    [holders, holderSort],
  );

  const totalBytes = profiles.reduce((acc, p) => acc + p.stats.bytes, 0);
  const totalAnchors = profiles.reduce((acc, p) => acc + p.stats.anchors, 0);
  const totalDonated = profiles.reduce((acc, p) => acc + p.stats.donatedUsdc, 0);

  const totalStaked = validators
    .filter((v) => v.active)
    .reduce((acc, v) => acc + v.stake, 0);
  const activeValidators = validators.filter((v) => v.active).length;
  const totalRewards = validators.reduce((acc, v) => acc + v.rewardsEarned, 0);

  const totalOriginated = platforms.reduce((acc, p) => acc + p.anchorsOriginated, 0);
  const totalPlatformRevenue = platforms.reduce((acc, p) => acc + p.revenueFoc, 0);
  const activePlatforms = platforms.filter((p) => p.active).length;

  const totalTracked = holders.reduce((acc, h) => acc + h.balance + h.staked, 0);
  const totalVotingPower = holders.reduce((acc, h) => acc + h.votingPower, 0);

  return (
    <PageShell size="wide" padding="lg" atmosphere>
      <PageHeader
        className="mb-8"
        index="06"
        kicker="Community ledger"
        title="The network leaderboard."
        lede="Every role in the verification market, ranked: the uploaders anchoring data, the validators verifying it, the platforms bringing it in, and the FOCAT holders governing it."
      />

      <Tabs value={board} onValueChange={(value) => setBoard(value as BoardKey)}>
        <TabsList>
          {BOARD_TABS.map(({ key, label }) => (
            <TabsTrigger key={key} value={key}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="uploaders">
          <TotalsStrip>
            <StatCounter
              value={totalAnchors}
              label="Anchors on the board"
              hint="All ranked uploaders"
              format={(n) => Math.round(n).toLocaleString()}
            />
            <StatCounter
              value={totalBytes}
              label="Bytes kept alive"
              hint="Across all runtimes"
              format={(n) => formatBytes(n)}
            />
            <StatCounter
              value={totalDonated}
              label="Donated back"
              hint="Public cache funding"
              format={(n) => Math.round(n).toString()}
              suffix=" USDC"
            />
          </TotalsStrip>
          <SortChips options={UPLOADER_SORTS} value={uploaderSort} onChange={setUploaderSort} />
          {loading ? <LoadingRows /> : <LeaderboardTable profiles={rankedProfiles} />}
          <BoardFootnote>
            Rankings aggregate public anchors per identity. Wallets{" "}
            <Link
              href="/profile"
              className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
            >
              linked on your profile
            </Link>{" "}
            are counted together, so anchoring from a Solana wallet and an EVM wallet builds one
            reputation instead of two. Donations to the public cache are tracked separately and
            never affect the anchor ranking.
          </BoardFootnote>
        </TabsContent>

        <TabsContent value="validators">
          <TotalsStrip>
            <StatCounter
              value={totalStaked}
              label="FOCAT staked"
              hint="Active validator set"
              format={(n) => Math.round(n).toLocaleString()}
            />
            <StatCounter
              value={activeValidators}
              label="Active validators"
              hint="Above minimum stake"
              format={(n) => Math.round(n).toString()}
            />
            <StatCounter
              value={totalRewards}
              label="Tips earned"
              hint="60% validator share, lifetime"
              format={(n) => Math.round(n).toLocaleString()}
              suffix=" FOCAT"
            />
          </TotalsStrip>
          <SortChips
            options={VALIDATOR_SORTS}
            value={validatorSort}
            onChange={setValidatorSort}
          />
          {loading ? <LoadingRows /> : <ValidatorBoard validators={rankedValidators} />}
          <BoardFootnote>
            Validators stake FOCAT to join the verification market: they earn 60% of every
            verified anchor tip pro-rata across active stake and sit on five-member dispute
            juries, where voting with the losing side is slashed. How the market works is on the{" "}
            <Link
              href="/protocol"
              className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
            >
              protocol page
            </Link>
            .
          </BoardFootnote>
        </TabsContent>

        <TabsContent value="platforms">
          <TotalsStrip>
            <StatCounter
              value={totalOriginated}
              label="Anchors originated"
              hint="Across registered platforms"
              format={(n) => Math.round(n).toLocaleString()}
            />
            <StatCounter
              value={totalPlatformRevenue}
              label="Platform revenue"
              hint="25% share, lifetime"
              format={(n) => Math.round(n).toLocaleString()}
              suffix=" FOCAT"
            />
            <StatCounter
              value={activePlatforms}
              label="Active platforms"
              hint="Registration is governance-gated"
              format={(n) => Math.round(n).toString()}
            />
          </TotalsStrip>
          <SortChips options={PLATFORM_SORTS} value={platformSort} onChange={setPlatformSort} />
          {loading ? <LoadingRows /> : <PlatformBoard platforms={rankedPlatforms} />}
          <BoardFootnote>
            Platforms are the integrators that bring anchors into the protocol — the FileOnChain
            app, partner APIs, and MCP clients each attribute uploads to their platform id. When
            an anchor verifies, 25% of its tip pays the originating platform&apos;s treasury.
          </BoardFootnote>
        </TabsContent>

        <TabsContent value="holders">
          <TotalsStrip>
            <StatCounter
              value={totalTracked}
              label="FOCAT tracked"
              hint="Balances + validator stake"
              format={(n) => Math.round(n).toLocaleString()}
            />
            <StatCounter
              value={totalVotingPower}
              label="Voting power delegated"
              hint="ERC20Votes delegation"
              format={(n) => Math.round(n).toLocaleString()}
            />
            <StatCounter
              value={holders.length}
              label="Holders ranked"
              hint="Treasury, platforms, validators, community"
              format={(n) => Math.round(n).toString()}
            />
          </TotalsStrip>
          <SortChips options={HOLDER_SORTS} value={holderSort} onChange={setHolderSort} />
          {loading ? (
            <LoadingRows />
          ) : (
            <HolderBoard holders={rankedHolders} totalTracked={totalTracked} />
          )}
          <BoardFootnote>
            FOCAT is the protocol token: it pays anchor tips and bonds, is staked by validators,
            and votes in governance — the treasury, fee split, and every protocol parameter are
            decided by holder votes through the on-chain Governor. Holdings count liquid balance
            plus locked stake; voting power follows ERC20Votes delegation, so it diverges from
            holdings when tokens are delegated away.
          </BoardFootnote>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
};

export default LeaderboardShell;
