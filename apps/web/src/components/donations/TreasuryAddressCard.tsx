import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { CopyButton } from "@/components/ui/CopyButton";
import { ChainBadge } from "@/components/ui/ChainBadge";
import type { ChainConfig } from "@fileonchain/sdk";

interface TreasuryAddressCardProps {
  chain: Pick<ChainConfig, "id" | "name" | "shortName">;
  /** Resolved on the server; null when the read failed. We surface
   *  "unavailable" instead of fabricating an address so a chain with
   *  no live RPC never displays a misleading hex. */
  address: `0x${string}` | null;
}

/**
 * TreasuryAddressCard — one row per provisioned donation chain.
 * Server-safe (no "use client") so the address is in the initial HTML
 * payload — search engines and no-JS visitors see the real treasury,
 * not a placeholder.
 */
export const TreasuryAddressCard = ({ chain, address }: TreasuryAddressCardProps) => {
  return (
    <Card variant="outlined">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Treasury</CardTitle>
          <ChainBadge
            chainId={chain.id}
            chainName={chain.name}
            shortName={chain.shortName}
            size="sm"
          />
        </div>
        <CardDescription>DonationEscrow forwards here on {chain.name}.</CardDescription>
      </CardHeader>
      {address ? (
        <div className="flex items-center gap-1.5">
          <p className="font-mono text-xs text-muted break-all">{address}</p>
          <CopyButton value={address} ariaLabel={`Copy ${chain.name} treasury address`} />
        </div>
      ) : (
        <p className="text-xs text-muted">Address unavailable — RPC read failed.</p>
      )}
    </Card>
  );
};

export default TreasuryAddressCard;