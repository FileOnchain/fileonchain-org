"use client";

import * as React from "react";
import { siteConfig } from "@/lib/site";

/**
 * Client-side Reown AppKit wiring for Hedera (WalletConnect + HederaAdapter).
 *
 * `createAppKit` is a singleton — calling it twice throws. We initialize
 * exactly once at module load via `useEffect`, then expose the resulting
 * `HederaAdapter` instance through `useHederaAppKit()` so `useHederaWallet`
 * can drive `connect()` / `signMessage()` / `disconnect()` without
 * re-creating the AppKit on every render.
 *
 * The provider is loaded via `next/dynamic({ ssr: false })` in
 * `apps/web/src/components/providers/WalletPairingProviders.tsx` —
 * `@reown/appkit` touches `window`, `IndexedDB`, and the WalletConnect relay
 * at mount.
 *
 * Requirements:
 *   - `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` provisioned at
 *     https://cloud.reown.com and exported to the deploy environment.
 *
 * Behavior when the project id is unset:
 *   - The provider mounts and renders children. The adapter is not created.
 *   - The first `useHederaAppKit()` call returns `adapter: null`. The wallet
 *     hook throws a clear runtime error pointing the operator at
 *     `apps/web/.env.example`.
 */

// Loose shape — keeps the provider usable even if `@hashgraph/hedera-wallet-connect`
// isn't installed (build-time guard) without forcing the consumer to cast.
export interface HederaAdapterLike {
  connect: (params: {
    id: string;
    type: string;
    chain: string;
  }) => Promise<{ address: string }>;
  signMessage: (params: {
    message: string;
    address: string;
  }) => Promise<{ signature: string }>;
  disconnect: () => Promise<unknown>;
}

type AppKitInstance = {
  adapter: HederaAdapterLike | null;
};

// Memoize the in-flight Promise, not just the resolved value. `createAppKit`
// is a singleton and throws if called twice; under React StrictMode (and
// HMR) `useEffect` can fire twice before the first `createAppKit` resolves,
// both invocations would pass the synchronous `if (cached)` check, and the
// second would throw. Caching the Promise ensures only one init runs.
let cachedInit: Promise<AppKitInstance> | null = null;

const initialize = (projectId: string): Promise<AppKitInstance> => {
  if (cachedInit) return cachedInit;
  cachedInit = (async (): Promise<AppKitInstance> => {
    const { createAppKit } = await import("@reown/appkit");
    const { HederaAdapter, HederaChainDefinition } = await import(
      "@hashgraph/hedera-wallet-connect"
    );

    // `createAppKit` requires the tuple shape `[AppKitNetwork, ...AppKitNetwork[]]`
    // — AppKitNetwork is a stricter subtype of CaipNetwork. A shared mutable
    // tuple satisfies both the adapter and AppKit call sites.
    const adapterNetworks: [
      (typeof HederaChainDefinition.Native.Testnet),
      (typeof HederaChainDefinition.Native.Mainnet),
    ] = [
      HederaChainDefinition.Native.Testnet,
      HederaChainDefinition.Native.Mainnet,
    ];

    const adapter = new HederaAdapter({
      namespace: HederaChainDefinition.Native.Testnet.chainNamespace,
      networks: adapterNetworks,
    });

    createAppKit({
      adapters: [adapter],
      networks: adapterNetworks,
      projectId,
      metadata: {
        name: siteConfig.name,
        description: siteConfig.description,
        url: siteConfig.url,
        icons: [`${siteConfig.url}/logo/svg/fileonchain-logo-clear-blue.svg`],
      },
    });

    return { adapter: adapter as unknown as HederaAdapterLike };
  })();
  return cachedInit;
};

const HederaAppKitContext = React.createContext<{
  adapter: HederaAdapterLike | null;
  error: string | null;
}>({ adapter: null, error: null });

export const useHederaAppKit = (): {
  adapter: HederaAdapterLike | null;
  error: string | null;
} => React.useContext(HederaAppKitContext);

export const HederaAppKitProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";
  const [adapter, setAdapter] = React.useState<HederaAdapterLike | null>(null);
  const [error, setError] = React.useState<string | null>(
    projectId
      ? null
      : "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set — Hedera wallet pairing is unavailable. See apps/web/.env.example.",
  );

  React.useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    initialize(projectId)
      .then((instance) => {
        if (cancelled) return;
        setAdapter(instance.adapter);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : "Failed to initialize Hedera wallet pairing",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <HederaAppKitContext.Provider value={{ adapter, error }}>
      {children}
    </HederaAppKitContext.Provider>
  );
};

export default HederaAppKitProvider;