"use client";

import * as React from "react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import CachePricingTable from "@/components/cache/CachePricingTable";
import CacheMyList from "@/components/cache/CacheMyList";
import CacheAccessModal from "@/components/cache/CacheAccessModal";
import { useCachePayment } from "@/hooks/useCachePayment";
import type { CacheTier } from "@/lib/mock/cache";

export default function CachePage() {
  const [tab, setTab] = React.useState("pricing");
  const [accessEntryId, setAccessEntryId] = React.useState<`0x${string}` | null>(null);
  const [minting, setMinting] = React.useState(false);
  const { pay, mintTestUsdc, onchainReady, activeChain } = useCachePayment();
  const { toast } = useToast();

  const handleChoose = async (tier: CacheTier) => {
    const fileId = `0x${Math.random().toString(16).slice(2).padStart(64, "0").slice(0, 64)}` as `0x${string}`;
    try {
      const { txHash } = await pay({ fileId, tier });
      toast({
        title: "Cache purchased",
        description: onchainReady
          ? `Paid on ${activeChain.name} — tx ${txHash.slice(0, 10)}…`
          : `Mock tx ${txHash.slice(0, 10)}… — entry visible in My cache.`,
        variant: "success",
      });
      setTab("my");
    } catch (e) {
      toast({
        title: "Payment failed",
        description: (e as Error).message,
        variant: "danger",
      });
    }
  };

  const handleMint = async () => {
    setMinting(true);
    try {
      const { txHash } = await mintTestUsdc(100);
      toast({
        title: "Test USDC minted",
        description: `100 USDC on ${activeChain.name} — tx ${txHash.slice(0, 10)}…`,
        variant: "success",
      });
    } catch (e) {
      toast({
        title: "Mint failed",
        description: (e as Error).message,
        variant: "danger",
      });
    } finally {
      setMinting(false);
    }
  };

  return (
    <PageShell size="wide" padding="lg" atmosphere>
      <PageHeader
        className="mb-8"
        index="03"
        kicker="Private cache"
        title="Private, encrypted storage."
        lede="Encrypt files client-side with AES-GCM, anchor a CID onchain, and grant address-based access. Funds go to the FileOnChain treasury."
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="my">My cache</TabsTrigger>
        </TabsList>

        <TabsContent value="pricing">
          {onchainReady && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
              <p className="text-xs text-muted">
                Payments on <span className="font-semibold text-foreground">{activeChain.name}</span> settle
                on-chain through CachePayments (USDC approve + pay).
              </p>
              {activeChain.testnet && (
                <Button size="sm" variant="secondary" onClick={handleMint} disabled={minting}>
                  {minting ? "Minting…" : "Mint 100 test USDC"}
                </Button>
              )}
            </div>
          )}
          <CachePricingTable onChoose={handleChoose} />
        </TabsContent>

        <TabsContent value="my">
          <CacheMyList onManageAccess={(id) => setAccessEntryId(id)} />
          <p className="mt-4 text-xs text-muted">
            Access is granted per entry — open an entry&apos;s grantee list to add or
            revoke addresses. Each grant is on-chain via CachePayments.grantAccess.
          </p>
        </TabsContent>
      </Tabs>

      <CacheAccessModal
        open={Boolean(accessEntryId)}
        onOpenChange={(open) => !open && setAccessEntryId(null)}
        entryId={accessEntryId}
      />
    </PageShell>
  );
}