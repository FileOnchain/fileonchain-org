"use client";

import type { ReactNode } from "react";
import { TonConnectProvider } from "@/components/auth/TonConnectProvider";
import { HederaAppKitProvider } from "@/components/auth/HederaAppKitProvider";

/**
 * Client wrapper for the two wallet-pairing providers that sit between the
 * server root layout and every page.
 *
 * These MUST NOT be loaded with `next/dynamic({ ssr: false })`: that mounts
 * a client-side-rendering bailout around `children`, and because `children`
 * is the entire app, every page prerendered as an empty
 * `<template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING">` shell. Crawlers
 * and link previews saw no headings or copy at all.
 *
 * Both providers are safe to render on the server: `TonConnectUIProvider`
 * returns a `null` instance when `window` is undefined, and
 * `HederaAppKitProvider` defers every browser-only import to `useEffect`.
 */
export const WalletPairingProviders = ({ children }: { children: ReactNode }) => (
  <TonConnectProvider>
    <HederaAppKitProvider>{children}</HederaAppKitProvider>
  </TonConnectProvider>
);

export default WalletPairingProviders;
