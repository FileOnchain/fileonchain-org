"use client";

import * as React from "react";
import type { ChainConfig } from "@fileonchain/sdk";
import {
  formatCostUsd,
  getChainCostEstimates,
  perChunkCost,
  totalCostFor,
} from "@/lib/mock/costs";
import type {
  AnchorStatus,
  StorageMode,
  UploadPaymentMethod,
} from "@/hooks/useFileUploader";
import { truncateFileName } from "@/utils/truncateFileName";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

interface UploadManifestProps {
  fileName: string;
  chunkCount: number;
  storageMode: StorageMode;
  storageChain: ChainConfig | null;
  externalUri: string;
  anchorChain: ChainConfig;
  paymentMethod: UploadPaymentMethod;
  anchorStatus: AnchorStatus;
  anchorProgress: number;
  storageTxHash: string | null;
  txHash: string | null;
  connectedAddress: string | null;
  disabled: boolean;
  onConnect: () => void;
  onAnchor: () => void;
}

const shortHash = (hash: string): string =>
  hash.length > 14 ? `${hash.slice(0, 10)}…${hash.slice(-4)}` : hash;

/** One segment of the ledger line: a labelled value with a mono voice. */
const Segment = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="min-w-0">
    <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">
      {label}
    </p>
    <p className="mt-0.5 truncate font-mono text-xs text-foreground">{children}</p>
  </div>
);

const SegmentArrow = () => (
  <span aria-hidden className="hidden self-end pb-0.5 font-mono text-xs text-muted/60 sm:block">
    →
  </span>
);

/**
 * UploadManifest — the ledger line this upload is about to write, assembled
 * live from the choices above it, with the signing action at its end. This
 * is deliberately the only place the primary action lives: you read the
 * whole entry — file, bytes, proof, payment — then you sign it.
 *
 * After anchoring it becomes the record: the storage and anchor transaction
 * hashes replace the estimate.
 */
const UploadManifest = ({
  fileName,
  chunkCount,
  storageMode,
  storageChain,
  externalUri,
  anchorChain,
  paymentMethod,
  anchorStatus,
  anchorProgress,
  storageTxHash,
  txHash,
  connectedAddress,
  disabled,
  onConnect,
  onAnchor,
}: UploadManifestProps) => {
  const busy =
    anchorStatus === "signing" || anchorStatus === "storing" || anchorStatus === "anchoring";
  const done = anchorStatus === "done";
  const twoPass = storageChain !== null && storageChain.id !== anchorChain.id;

  // Estimated total: proof anchors on the anchoring chain, plus the storage
  // pass when the bytes go to a different chain. Same rough model as the
  // cost panel — the panel remains the place to inspect it per chain.
  const estimate = React.useMemo(() => {
    const estimates = getChainCostEstimates();
    const anchorEst = estimates.find((e) => e.chainId === anchorChain.id);
    let usd = anchorEst ? totalCostFor(anchorEst, chunkCount).usd : 0;
    if (twoPass && storageChain) {
      const storageEst = estimates.find((e) => e.chainId === storageChain.id);
      if (storageEst) usd += perChunkCost(storageEst).usd * chunkCount;
    }
    return usd;
  }, [anchorChain.id, storageChain, twoPass, chunkCount]);

  const bytesValue =
    storageMode === "onchain" && storageChain
      ? `${storageChain.shortName} · ${chunkCount} ${chunkCount === 1 ? "chunk" : "chunks"}`
      : storageMode === "external" && externalUri.trim()
        ? truncateFileName(externalUri.trim(), 24)
        : "not stored";

  const payValue =
    paymentMethod === "payg"
      ? connectedAddress
        ? `wallet ${connectedAddress.slice(0, 6)}…${connectedAddress.slice(-4)}`
        : "wallet — not connected"
      : paymentMethod === "credits"
        ? "account credits"
        : "provider key";

  const actionLabel = done
    ? "Anchored ✓"
    : anchorStatus === "signing"
      ? "Waiting for signature…"
      : anchorStatus === "storing"
        ? `Storing bytes ${anchorProgress}/${chunkCount}…`
        : anchorStatus === "anchoring"
          ? paymentMethod === "payg"
            ? `Sending anchors ${anchorProgress}/${chunkCount}…`
            : "Anchoring server-side…"
          : paymentMethod === "payg"
            ? storageMode === "onchain"
              ? "Sign, store & anchor"
              : "Sign & anchor"
            : paymentMethod === "credits"
              ? "Anchor with credits"
              : "Anchor via provider";

  return (
    <div
      className={cn(
        "rounded-2xl border bg-surface-elevated p-4 shadow-elev-1 md:p-5",
        done ? "border-success/40" : "border-border",
      )}
    >
      <div className="flex items-center gap-3">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
          {done ? "Record" : "Manifest"}
        </p>
        <span aria-hidden className="hairline min-w-8 flex-1 opacity-60" />
        {!done && (
          <p className="font-mono text-[10px] text-muted">
            est. {formatCostUsd(estimate)}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        {/* The ledger line — file → bytes → proof → payment. */}
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-3 sm:flex sm:items-end sm:gap-4">
          <Segment label="File">
            {truncateFileName(fileName, 22)} · {chunkCount}{" "}
            {chunkCount === 1 ? "chunk" : "chunks"}
          </Segment>
          <SegmentArrow />
          <Segment label="Bytes">
            {done && storageTxHash ? shortHash(storageTxHash) : bytesValue}
          </Segment>
          <SegmentArrow />
          <Segment label="Proof">
            {done && txHash
              ? shortHash(txHash)
              : `${anchorChain.shortName} · ${chunkCount + 1} anchors`}
          </Segment>
          <SegmentArrow />
          <Segment label="Paid by">{payValue}</Segment>
        </div>

        {/* Actions — connect (wallet path) then the one signing action. */}
        {!done && (
          <div className="flex shrink-0 items-center gap-2">
            {paymentMethod === "payg" && (
              <Button variant="secondary" onClick={onConnect} disabled={busy}>
                {connectedAddress
                  ? `${connectedAddress.slice(0, 6)}…${connectedAddress.slice(-4)}`
                  : "Connect wallet"}
              </Button>
            )}
            <Button onClick={onAnchor} isLoading={busy} disabled={disabled}>
              {actionLabel}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadManifest;
