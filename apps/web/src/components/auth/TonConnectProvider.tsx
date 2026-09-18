"use client";

import * as React from "react";
import { TonConnectUIProvider } from "@tonconnect/ui-react";
import { siteConfig } from "@/lib/site";

/**
 * Thin client wrapper over `@tonconnect/ui-react`'s `TonConnectUIProvider`.
 *
 * The provider builds a `TonConnectUI` singleton from a manifest URL — TON
 * Connect refuses HTTP manifests even in dev, so the URL must be HTTPS.
 *
 * Resolution order for `manifestUrl`:
 *   1. `NEXT_PUBLIC_TONCONNECT_MANIFEST_URL` (operator override; useful when
 *      dev runs over HTTP and the manifest is hosted on a public origin).
 *   2. `${NEXT_PUBLIC_SITE_URL}/tonconnect-manifest.json` — the static file
 *      shipped at `apps/web/public/tonconnect-manifest.json`. In production
 *      this resolves to the canonical `siteConfig.url`.
 *
 * Rendered on the server as well as the client (see
 * `components/providers/WalletPairingProviders.tsx`): `TonConnectUIProvider`
 * only constructs the `TonConnectUI` singleton when `window` exists and
 * provides `null` otherwise, so it never touches the DOM during prerender.
 */
export const TonConnectProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const manifestUrl =
    process.env.NEXT_PUBLIC_TONCONNECT_MANIFEST_URL ||
    `${siteConfig.url}/tonconnect-manifest.json`;
  return (
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      {children}
    </TonConnectUIProvider>
  );
};

export default TonConnectProvider;