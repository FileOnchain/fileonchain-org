"use client";

import * as React from "react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import CachePricingTable from "@/components/cache/CachePricingTable";
import CacheMyList from "@/components/cache/CacheMyList";
import CacheAccessModal from "@/components/cache/CacheAccessModal";
import { useCachePayment } from "@/hooks/useCachePayment";
import type { CacheTier } from "@/lib/mock/cache";

export default function CachePage() {
  const [tab, setTab] = React.useState("pricing");
  const [accessEntryId, setAccessEntryId] = React.useState<`0x${string}` | null>(null);
  const { pay } = useCachePayment();
  const { toast } = useToast();

  const handleChoose = async (tier: CacheTier) => {
    const fileId = `0x${Math.random().toString(16).slice(2).padStart(64, "0").slice(0, 64)}` as `0x${string}`;
    try {
      const { txHash } = await pay({ fileId, tier });
      toast({
        title: "Cache purchased",
        description: `Mock tx ${txHash.slice(0, 10)}… — entry visible in My cache.`,
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