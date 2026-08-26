"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { signIn } from "next-auth/react";
import { FaGithub, FaGoogle } from "react-icons/fa6";
import Button from "@/components/ui/Button";
import type { OAuthProviderInfo } from "@/lib/auth/config";
import { trackEvent } from "@/lib/analytics";

// The same panel the nav's connect modal renders — connect and sign-in are
// one flow. `ssr: false` keeps the chain-SDK bundles out of Node SSR.
const WalletConnectPanel = dynamic(
  () =>
    import("@/components/chain/WalletConnectPanel").then(
      (m) => m.WalletConnectPanel,
    ),
  { ssr: false },
);

interface LoginOptionsProps {
  oauthProviders: OAuthProviderInfo[];
  /** Same-site path to land on after sign-in. */
  next: string;
}

const PROVIDER_ICONS: Record<OAuthProviderInfo["id"], React.ReactNode> = {
  google: <FaGoogle aria-hidden />,
  github: <FaGithub aria-hidden />,
};

/**
 * Sign-in options: OAuth providers (only those configured server-side) and
 * wallet sign-message. Rendered by the server /login page so the provider
 * list never leaks env checks into the client bundle.
 */
export const LoginOptions = ({ oauthProviders, next }: LoginOptionsProps) => {
  const [pending, setPending] = React.useState<string | null>(null);

  const handleOAuth = (provider: OAuthProviderInfo) => {
    setPending(provider.id);
    trackEvent("auth_sign_in", { method: provider.id });
    void signIn(provider.id, { redirectTo: next });
  };

  return (
    <div className="flex flex-col gap-3">
      {oauthProviders.map((provider) => (
        <Button
          key={provider.id}
          variant="secondary"
          size="lg"
          fullWidth
          leftIcon={PROVIDER_ICONS[provider.id]}
          isLoading={pending === provider.id}
          onClick={() => handleOAuth(provider)}
        >
          Continue with {provider.name}
        </Button>
      ))}
      {oauthProviders.length === 0 && (
        <p className="rounded-md border border-border bg-surface px-4 py-3 text-sm text-muted">
          OAuth sign-in is not configured in this environment — use a wallet
          below.
        </p>
      )}

      <div className="my-2 flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-wide text-muted">
          or sign in with a wallet
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      {/* Full-page navigation after sign-in: the fresh session cookie
          reaches every server component, and it avoids racing the /login
          page's own server-side redirect (client push + refresh here trips
          Next 15.0.x's Router). */}
      <WalletConnectPanel onSignedIn={() => window.location.assign(next)} />
    </div>
  );
};

export default LoginOptions;
