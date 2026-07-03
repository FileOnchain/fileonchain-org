"use client";

import * as React from "react";
import dynamicImport from "next/dynamic";
import { useRouter } from "next/navigation";
import { FiUser } from "react-icons/fi";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useWalletStates } from "@/states/wallet";

const ChainConnectModal = dynamicImport(
  () =>
    import("@/components/chain/ChainConnectModal").then(
      (m) => m.ChainConnectModal,
    ),
  { ssr: false },
);

/**
 * /profile — entry point for "my profile". Redirects to the connected
 * wallet's public profile; prompts to connect when no wallet is attached.
 */
export default function OwnProfilePage() {
  const router = useRouter();
  const [connectOpen, setConnectOpen] = React.useState(false);

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

  React.useEffect(() => {
    if (connectedAddress) {
      router.replace(`/profile/${encodeURIComponent(connectedAddress)}`);
    }
  }, [connectedAddress, router]);

  return (
    <PageShell size="narrow" padding="lg" atmosphere>
      {connectedAddress ? (
        <div className="space-y-2 py-16 text-center text-sm text-muted">
          <p>Opening your profile…</p>
        </div>
      ) : (
        <EmptyState
          icon={<FiUser size={20} />}
          title="Connect a wallet to see your profile"
          description="Your public profile aggregates the anchors, bytes, and donations of every wallet you've linked — across EVM, Substrate, Solana, and Aptos."
          action={<Button onClick={() => setConnectOpen(true)}>Connect wallet</Button>}
        />
      )}
      <ChainConnectModal open={connectOpen} onOpenChange={setConnectOpen} />
    </PageShell>
  );
}
