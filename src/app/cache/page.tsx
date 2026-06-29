"use client";

import * as React from "react";
import { PageShell } from "@/components/layout/PageShell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
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
    <PageShell size="wide" padding="lg">
      <div className="mb-8 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          Private cache
        </p>
        <h1 className="text-3xl md:text-4xl font-bold text-foreground">
          Pay for private, encrypted storage
        </h1>
        <p className="text-muted max-w-2xl">
          Encrypt files client-side with AES-GCM, anchor a CID onchain, and grant address-based access.
          Funds go to the FileOnChain treasury.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="my">My cache</TabsTrigger>
          <TabsTrigger value="access">Access list</TabsTrigger>
        </TabsList>

        <TabsContent value="pricing">
          <CachePricingTable onChoose={handleChoose} />
        </TabsContent>

        <TabsContent value="my">
          <CacheMyList onManageAccess={(id) => setAccessEntryId(id)} />
        </TabsContent>

        <TabsContent value="access">
          <Card variant="outlined" className="border-dashed">
            <CardHeader>
              <CardTitle>Access list</CardTitle>
              <CardDescription>
                Open an entry from &ldquo;My cache&rdquo; to manage its grantees. Each grant is on-chain via
                CachePayments.grantAccess.
              </CardDescription>
            </CardHeader>
            <p className="text-sm text-muted">
              Switch to the My cache tab to manage access for a specific entry.
            </p>
          </Card>
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