"use client";

import * as React from "react";
import type { ChainFamily } from "@fileonchain/sdk";

// One lookup per address per session — ENS is display sugar, never worth a
// spinner or a retry loop. Failures cache as null (no name shown).
const ensCache = new Map<string, Promise<string | null>>();

const lookupEnsName = (address: string): Promise<string | null> => {
  let entry = ensCache.get(address);
  if (!entry) {
    entry = (async () => {
      const [{ createPublicClient, http }, { mainnet }] = await Promise.all([
        import("viem"),
        import("viem/chains"),
      ]);
      const client = createPublicClient({ chain: mainnet, transport: http() });
      return client.getEnsName({ address: address as `0x${string}` });
    })().catch(() => null);
    ensCache.set(address, entry);
  }
  return entry;
};

/**
 * Best-effort primary ENS name for a connected EVM wallet (reverse record,
 * forward-verified by viem). Resolves against Ethereum mainnet regardless of
 * the active anchoring chain — ENS lives there. Null for other families,
 * while resolving, and when the address has no name.
 */
export const useEnsName = (
  address: string | null | undefined,
  family: ChainFamily | null,
): string | null => {
  const [ensName, setEnsName] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (family !== "evm" || !address) {
      setEnsName(null);
      return;
    }
    let cancelled = false;
    void lookupEnsName(address).then((name) => {
      if (!cancelled) setEnsName(name);
    });
    return () => {
      cancelled = true;
    };
  }, [address, family]);

  return ensName;
};

export default useEnsName;
