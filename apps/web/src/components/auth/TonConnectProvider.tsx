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
 * The component is loaded via `next/dynamic({ ssr: false })` in
 * `apps/web/src/app/layout.tsx` — `@tonconnect/ui-react` touches `window` at
 * mount and cannot render server-side.
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