"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

/**
 * Client-only wrapper for the two browser-touching wallet-pairing
 * providers. `next/dynamic({ ssr: false })` is forbidden in Server
 * Components, so this thin client wrapper sits between the server root
 * layout and the provider modules.
 */
const TonConnectProvider = dynamic(
  () => import("@/components/auth/TonConnectProvider"),
  { ssr: false },
);
const HederaAppKitProvider = dynamic(
  () => import("@/components/auth/HederaAppKitProvider"),
  { ssr: false },
);

export const WalletPairingProviders = ({ children }: { children: ReactNode }) => (
  <TonConnectProvider>
    <HederaAppKitProvider>{children}</HederaAppKitProvider>
  </TonConnectProvider>
);

export default WalletPairingProviders;