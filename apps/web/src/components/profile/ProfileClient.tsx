"use client";

import * as React from "react";
import Link from "next/link";
import { FiArrowRight, FiAward, FiLink } from "react-icons/fi";
import { CHAIN_FAMILY_LABELS } from "@fileonchain/sdk";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { Identicon } from "@/components/ui/Identicon";
import { StatCounter } from "@/components/LiveLedgerTicker";
import RuntimeChip from "@/components/profile/RuntimeChip";
import LinkWalletModal from "@/components/profile/LinkWalletModal";
import { useIdentityStates, hydrateIdentity } from "@/states/identity";
import { useWalletStates } from "@/states/wallet";
import { useAccountWallets } from "@/hooks/useAccountWallets";
import type { LinkedWallet, PublicProfile } from "@/lib/mock/profiles";
import type { SearchHit } from "@/lib/mock/cid-indexer";
import { truncateAddress, truncateCID } from "@/lib/cid/format";

interface ProfileClientProps {
  profile: PublicProfile;
  initialFiles: Array<{ cid: string; hits: SearchHit[] }>;
}

/**
 * ProfileClient — public profile for an uploader identity. When the
 * connected wallet owns this profile, the linked-wallets card becomes
 * editable (link/unlink per runtime) and locally recorded links are merged
 * into the display.
 *
 * The "Anchored files" list now renders CIDs only — there's no
 * off-chain file metadata to show. Each entry shows the truncated CID
 * and the chain count for that CID. The initial list comes from the
 * server-rendered parent (no client-side DB shim); the `filesLoaded`
 * state is kept so future refresh logic has a stable seam.
 */
const ProfileClient = ({ profile, initialFiles }: ProfileClientProps) => {
  const [linkModalOpen, setLinkModalOpen] = React.useState(false);
  const files = initialFiles;
  const filesLoaded = true;

  // Identity store is localStorage-backed — hydrate after mount so the SSR
  // markup stays deterministic (same pattern as the theme store).
  const identityHydrated = useIdentityStates((s) => s.hydrated);
  const localLinks = useIdentityStates((s) => s.linked);
  React.useEffect(() => {
    if (!identityHydrated) hydrateIdentity();
  }, [identityHydrated]);

  const chainFamily = useWalletStates((s) => s.chainFamily);
  const evmAddress = useWalletStates((s) => s.evmAddress);
  const solanaAddress = useWalletStates((s) => s.solanaAddress);
  const aptosAddress = useWalletStates((s) => s.aptosAddress);
  const substrateAccount = useWalletStates((s) => s.selectedAccount);

  const connectedAddress =
    chainFamily === "evm"
      ? evmAddress
      : chainFamily === "solana"
        ? solanaAddress
        : chainFamily === "aptos"
          ? aptosAddress
          : substrateAccount?.address ?? null;

  const lowered = profile.address.toLowerCase();
  const isOwn =
    Boolean(connectedAddress) &&
    (connectedAddress!.toLowerCase() === lowered ||
      profile.linkedWallets.some(
        (w) => w.address.toLowerCase() === connectedAddress!.toLowerCase(),
      ));

  // Server-verified links from the signed-in account (see /api/wallets),
  // via the shared account↔wallet hook; refreshed when the link modal closes.
  const { authed, linked: accountLinks, refresh } = useAccountWallets();
  React.useEffect(() => {
    if (isOwn && authed && !linkModalOpen) void refresh();
  }, [isOwn, authed, linkModalOpen, refresh]);
  const serverLinks = React.useMemo<LinkedWallet[]>(
    () =>
      isOwn && authed
        ? accountLinks.map((w) => ({
            family: w.family,
            address: w.address,
            linkedAt: Math.floor(new Date(w.verifiedAt).getTime() / 1000),
          }))
        : [],
    [isOwn, authed, accountLinks],
  );

  // Registry links come with the profile; the owner's locally recorded links
  // override per family (so the modal reflects immediately), and server-
  // verified links from the account win over both.
  const displayedLinks: LinkedWallet[] = React.useMemo(() => {
    if (!isOwn || !identityHydrated) return profile.linkedWallets;
    const byFamily = new Map(profile.linkedWallets.map((w) => [w.family, w]));
    for (const w of localLinks) byFamily.set(w.family, w);
    for (const w of serverLinks) byFamily.set(w.family, w);
    return Array.from(byFamily.values());
  }, [isOwn, identityHydrated, profile.linkedWallets, localLinks, serverLinks]);

  React.useEffect(() => {
    void 0; // initialFiles come from the server-rendered parent
  }, []);

  return (
    <PageShell size="wide" padding="lg" atmosphere>
      {/* Ledger rule — mirrors PageHeader's kicker row. */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-[10px] font-semibold tracking-[0.22em] text-primary">
          N°07
        </span>
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
          Public profile
        </p>
        <span aria-hidden className="hairline min-w-8 flex-1 opacity-60" />
      </div>

      {/* Identity header */}
      <header className="mt-5 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <Identicon
            value={profile.handle ?? profile.address}
            size={64}
            rounded={false}
          />
          <div className="min-w-0 space-y-2">
            <h1 className="truncate text-3xl font-bold leading-[1.02] tracking-tight text-foreground md:text-4xl">
              {profile.handle ?? truncateAddress(profile.address)}
            </h1>
            <div className="flex items-center gap-1.5">
              <span className="truncate font-mono text-xs text-muted" title={profile.address}>
                {truncateAddress(profile.address, 10)}
              </span>
              <CopyButton value={profile.address} ariaLabel="Copy address" />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              {profile.rank && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-0.5 font-mono text-[11px] text-foreground">
                  <FiAward size={12} className="text-accent" />
                  Rank {String(profile.rank).padStart(2, "0")}
                </span>
              )}
              <span>
                First seen{" "}
                {new Date(profile.firstSeen * 1000).toLocaleDateString(undefined, {
                  month: "short",
                  year: "numeric",
                })}
              </span>
              {isOwn && (
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary">
                  This is you
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isOwn && (
            <Button
              leftIcon={<FiLink size={14} />}
              onClick={() => setLinkModalOpen(true)}
            >
              Link wallets
            </Button>
          )}
          <Link
            href="/leaderboard"
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-border bg-surface-elevated px-4 text-sm font-medium text-foreground transition-all duration-base ease-out-soft hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Leaderboard →
          </Link>
        </div>
      </header>

      {/* Stat strip */}
      <div className="mt-8 grid grid-cols-2 gap-6 rounded-2xl border border-border bg-surface p-6 sm:gap-8 md:grid-cols-4">
        <StatCounter
          value={profile.stats.files}
          label="Public CIDs"
          hint="Indexed anchors"
          format={(n) => Math.round(n).toString()}
        />
        <StatCounter
          value={profile.stats.bytes}
          label="Bytes anchored"
          hint="Across all files"
          format={(n) => Math.round(n).toString()}
        />
        <StatCounter
          value={profile.stats.anchors}
          label="Onchain anchors"
          hint={`Across ${profile.stats.chains || "—"} chains`}
          format={(n) => Math.round(n).toString()}
        />
        <StatCounter
          value={profile.stats.donatedUsdc}
          label="Donated"
          hint="Public cache funding"
          format={(n) => Math.round(n).toString()}
          suffix=" USDC"
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* Anchored files ---------------------------------------- */}
        <section className="lg:col-span-2">
          <header className="mb-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
              Anchored files
            </p>
            <h2 className="mt-1 text-lg font-bold text-foreground">
              Public anchors by this identity
            </h2>
          </header>
          {!filesLoaded ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-lg border border-border bg-surface"
                />
              ))}
            </div>
          ) : files.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-sm text-muted">
              No public anchors indexed for this identity yet.
              {isOwn && (
                <>
                  {" "}
                  <Link
                    href="/"
                    className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
                  >
                    Anchor your first file →
                  </Link>
                </>
              )}
            </div>
          ) : (
            <ul className="overflow-hidden rounded-2xl border border-border bg-surface divide-y divide-border">
              {files.map((file) => (
                <li key={file.cid}>
                  <Link
                    href={`/explorer/${file.cid}`}
                    className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono font-semibold text-foreground">
                        {truncateCID(file.cid, 10, 8)}
                      </p>
                      <p className="truncate text-[11px] text-muted">
                        Anchored on {file.hits.length} chain
                        {file.hits.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <FiArrowRight
                      size={14}
                      className="shrink-0 text-muted transition-transform duration-base group-hover:translate-x-0.5 group-hover:text-primary"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Linked wallets ---------------------------------------- */}
        <section>
          <header className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
                Identity
              </p>
              <h2 className="mt-1 text-lg font-bold text-foreground">
                Linked wallets
              </h2>
            </div>
          </header>
          <div className="rounded-2xl border border-border bg-surface p-4">
            <ul className="space-y-3">
              {/* Primary wallet */}
              <li className="flex items-center gap-2.5">
                <RuntimeChip family={profile.family} />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">
                    {CHAIN_FAMILY_LABELS[profile.family]}
                    <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                      Primary
                    </span>
                  </p>
                  <p className="truncate font-mono text-[11px] text-muted">
                    {truncateAddress(profile.address, 8)}
                  </p>
                </div>
              </li>
              {displayedLinks.map((wallet) => (
                <li key={`${wallet.family}:${wallet.address}`} className="flex items-center gap-2.5">
                  <RuntimeChip family={wallet.family} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">
                      {CHAIN_FAMILY_LABELS[wallet.family]}
                    </p>
                    <p className="truncate font-mono text-[11px] text-muted">
                      {truncateAddress(wallet.address, 8)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            {displayedLinks.length === 0 && (
              <p className="mt-3 text-xs text-muted">
                No other runtimes linked yet.
              </p>
            )}
            {isOwn ? (
              <Button
                variant="secondary"
                size="sm"
                fullWidth
                className="mt-4"
                leftIcon={<FiLink size={14} />}
                onClick={() => setLinkModalOpen(true)}
              >
                Manage linked wallets
              </Button>
            ) : (
              <p className="mt-4 text-xs text-muted">
                Linked wallets are proven with a signature from both addresses,
                so activity on any runtime rolls up to one identity.
              </p>
            )}
          </div>
        </section>
      </div>

      {isOwn && (
        <LinkWalletModal
          open={linkModalOpen}
          onOpenChange={setLinkModalOpen}
          primaryAddress={profile.address}
          primaryFamily={profile.family}
        />
      )}
    </PageShell>
  );
};

export default ProfileClient;
