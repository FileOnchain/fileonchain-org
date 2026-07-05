"use client";

import * as React from "react";
import { FiHeart } from "react-icons/fi";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import ChainSelect from "@/components/chain/ChainSelect";
import { useDonation } from "@/hooks/useDonation";
import { useVisibleChains } from "@/hooks/useVisibleChains";
import { CHAINS, isValidCID } from "@fileonchain/sdk";
import type { DonationRecipient } from "@/lib/mock/donations";

interface DonateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCid?: string;
}

const TREASURY_ADDRESS = "0x0001Treasury0000000000000000000000";

/**
 * DonateModal — three-tier donation flow (Platform / Per-CID / Per-chain).
 * Mock submit returns a fake tx hash and adds an entry to the feed.
 */
export const DonateModal = ({ open, onOpenChange, defaultCid }: DonateModalProps) => {
  const [tab, setTab] = React.useState<DonationRecipient>(defaultCid ? "PerCID" : "Platform");
  const [cid, setCid] = React.useState(defaultCid ?? "");
  const [chainId, setChainId] = React.useState(CHAINS[0].id);
  const [amount, setAmount] = React.useState("5");
  const [memo, setMemo] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const { toast } = useToast();
  const { donate } = useDonation();
  const visibleChains = useVisibleChains();

  const reset = () => {
    setCid(defaultCid ?? "");
    setChainId(CHAINS[0].id);
    setAmount("5");
    setMemo("");
    setError(null);
  };

  const handleSubmit = async () => {
    setError(null);
    if (Number(amount) <= 0) {
      setError("Amount must be greater than zero.");
      return;
    }
    if (memo.length > 140) {
      setError("Memo must be 140 chars or fewer.");
      return;
    }
    if (tab === "PerCID" && !isValidCID(cid)) {
      setError("Enter a valid CIDv1 base32 hash.");
      return;
    }

    try {
      const target = tab === "Platform" ? "platform" : tab === "PerCID" ? cid : chainId;
      const { txHash } = await donate({
        recipientType: tab,
        target,
        amount: `${amount} USDC`,
        memo,
      });
      toast({
        title: "Donation sent",
        description: `Mock tx ${txHash.slice(0, 10)}… — thanks!`,
        variant: "success",
      });
      reset();
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Donation failed",
        description: (e as Error).message,
        variant: "danger",
      });
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      title="Donate to FileOnChain"
      description={`Treasury: ${TREASURY_ADDRESS.slice(0, 8)}…${TREASURY_ADDRESS.slice(-6)}`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} leftIcon={<FiHeart size={14} />}>
            Send donation
          </Button>
        </>
      }
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as DonationRecipient)}>
        <TabsList>
          <TabsTrigger value="Platform">Platform</TabsTrigger>
          <TabsTrigger value="PerCID">Per-CID</TabsTrigger>
          <TabsTrigger value="PerChain">Per-chain</TabsTrigger>
        </TabsList>

        <TabsContent value="Platform">
          <Card variant="outlined">
            <p className="text-sm text-muted">
              Support the FileOnChain platform. Funds maintain the public cache and pay for RPC.
            </p>
          </Card>
        </TabsContent>

        <TabsContent value="PerCID">
          <Input
            label="CID to support"
            value={cid}
            onChange={(e) => setCid(e.target.value)}
            placeholder="bafy..."
            error={error ?? undefined}
            fullWidth
          />
          <p className="mt-2 text-xs text-muted">
            Funds pinning for this CID&apos;s chunks across chains.
          </p>
        </TabsContent>

        <TabsContent value="PerChain">
          <label className="block" htmlFor="donate-chain">
            <span className="text-sm font-medium text-foreground">Chain</span>
            <div className="mt-1">
              <ChainSelect
                id="donate-chain"
                chains={visibleChains}
                value={chainId}
                onValueChange={setChainId}
              />
            </div>
          </label>
          <p className="mt-2 text-xs text-muted">
            Funds the public cache layer for the selected chain.
          </p>
        </TabsContent>
      </Tabs>

      <div className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Amount (USDC)"
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            fullWidth
          />
          <Input
            label="Memo (optional)"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            maxLength={140}
            placeholder="What's this for?"
            fullWidth
          />
        </div>
        {tab === "PerCID" && error && error.includes("valid") && null}
      </div>
    </Modal>
  );
};

export default DonateModal;