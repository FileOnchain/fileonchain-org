"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { FiDatabase, FiInfo } from "react-icons/fi";
import {
  getChunkDataBudget,
  isStorageCapable,
  storageChunkCount,
  type ChainConfig,
  type ChainId,
} from "@fileonchain/sdk";
import {
  formatCostUsd,
  getChainCostEstimates,
  perChunkCost,
} from "@/lib/mock/costs";
import type { StorageMode, UploadPaymentMethod } from "@/hooks/useFileUploader";
import { useVisibleChains } from "@/hooks/useVisibleChains";
import { cn } from "@/lib/cn";

interface StorageSelectorProps {
  fileSize: number;
  mode: StorageMode;
  /** Resolved storage chain (null when mode isn't "onchain"). */
  storageChain: ChainConfig | null;
  externalUri: string;
  activeChain: ChainConfig;
  paymentMethod: UploadPaymentMethod;
  disabled?: boolean;
  onModeChange: (mode: StorageMode) => void;
  onStorageChainChange: (chainId: ChainId) => void;
  onExternalUriChange: (uri: string) => void;
}

const MODES: { id: StorageMode; label: string; hint: string }[] = [
  {
    id: "onchain",
    label: "Store on-chain",
    hint: "Chunk bytes ride inside the anchors — the chain holds the file",
  },
  {
    id: "external",
    label: "Link existing copy",
    hint: "You already host the bytes; the anchor carries your URI",
  },
  {
    id: "none",
    label: "Anchor only",
    hint: "Proof without bytes — CIDs only",
  },
];

/** Autonomys is the suggested storage home: a permanent-storage network
 * whose anchors embed chunk bytes by default, cheap for large files. */
const isSuggested = (chain: ChainConfig): boolean =>
  chain.embedsChunkData === true;

/**
 * StorageSelector — where the file's bytes live. On-chain storage is the
 * default: bytes are embedded in the chunk anchors on the selected storage
 * chain (the anchoring chain when it can carry them, Autonomys suggested
 * for everything big), sized to each chain's per-transaction data budget.
 * Opting out offers a URI field so anchors can still point at an existing
 * copy (IPFS, Auto Drive, anywhere).
 */
const StorageSelector = ({
  fileSize,
  mode,
  storageChain,
  externalUri,
  activeChain,
  paymentMethod,
  disabled,
  onModeChange,
  onStorageChainChange,
  onExternalUriChange,
}: StorageSelectorProps) => {
  const visibleChains = useVisibleChains();

  // Storage targets: every visible, active, storage-capable chain — plus
  // the resolved storage chain itself (it may be the Autonomys fallback a
  // testnet-visibility preference would otherwise hide).
  const options = React.useMemo(() => {
    const chains = visibleChains.filter(
      (chain) => chain.status === "active" && isStorageCapable(chain),
    );
    if (storageChain && !chains.some((c) => c.id === storageChain.id)) {
      chains.unshift(storageChain);
    }
    // Suggested (data-first) chains float to the top, then the anchor chain.
    return chains.sort((a, b) => {
      const rank = (c: ChainConfig) =>
        isSuggested(c) ? 0 : c.id === activeChain.id ? 1 : 2;
      return rank(a) - rank(b);
    });
  }, [visibleChains, storageChain, activeChain.id]);

  const costByChain = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const est of getChainCostEstimates()) {
      map.set(est.chainId, perChunkCost(est).usd);
    }
    return map;
  }, []);

  const storageTxs = storageChain ? storageChunkCount(storageChain, fileSize) : null;
  const storageCost =
    storageChain && storageTxs !== null
      ? (costByChain.get(storageChain.id) ?? 0) * storageTxs
      : null;

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 md:p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <FiDatabase size={13} className="text-primary" />
          {mode === "onchain" && storageChain
            ? `Bytes live on ${storageChain.name}`
            : mode === "external"
              ? "Bytes live at your URI"
              : "No bytes stored — proof only"}
        </p>
        {mode === "onchain" && storageChain && storageTxs !== null && (
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
              Storage cost
            </p>
            <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
              {storageCost !== null ? formatCostUsd(storageCost) : "—"}
              <span className="ml-1.5 text-[10px] font-normal text-muted">
                {storageTxs.toLocaleString()} tx
              </span>
            </p>
          </div>
        )}
      </header>

      {/* Mode switch */}
      <div className="mt-3 grid gap-1.5 sm:grid-cols-3">
        {MODES.map(({ id, label, hint }) => (
          <button
            key={id}
            type="button"
            disabled={disabled}
            aria-pressed={mode === id}
            onClick={() => onModeChange(id)}
            className={cn(
              "rounded-lg border px-3 py-2 text-left text-xs transition-colors duration-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              mode === id
                ? "border-primary bg-primary/5"
                : "border-border bg-surface-elevated hover:border-primary/40",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <span className="font-semibold text-foreground">{label}</span>
            <span className="mt-0.5 block text-[10px] leading-snug text-muted">{hint}</span>
          </button>
        ))}
      </div>

      {mode === "onchain" && (
        <>
          <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {options.map((chain) => {
              const isSelected = chain.id === storageChain?.id;
              const txs = storageChunkCount(chain, fileSize);
              const cost =
                txs !== null ? (costByChain.get(chain.id) ?? 0) * txs : null;
              const budget = getChunkDataBudget(chain);
              return (
                <motion.button
                  key={chain.id}
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  disabled={disabled}
                  aria-pressed={isSelected}
                  onClick={() => onStorageChainChange(chain.id)}
                  className={cn(
                    "flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left text-xs transition-colors duration-base ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border bg-surface-elevated hover:border-primary/40",
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="truncate font-mono font-semibold text-foreground">
                      {chain.shortName}
                    </span>
                    {isSuggested(chain) && (
                      <span className="shrink-0 rounded-full border border-success/30 bg-success/5 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-success">
                        Suggested
                      </span>
                    )}
                    {chain.id === activeChain.id && (
                      <span className="shrink-0 rounded-full border border-border bg-surface px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted">
                        Anchor chain
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted">
                    {txs !== null ? `${txs.toLocaleString()} tx` : "—"}
                    {cost !== null && ` · ~${formatCostUsd(cost)}`}
                    {budget !== null && ` · ${(budget / 1024).toFixed(budget >= 1024 ? 0 : 1)} KiB/tx`}
                  </span>
                </motion.button>
              );
            })}
          </div>
          {storageChain && storageChain.family !== activeChain.family && (
            <p className="mt-2 inline-flex items-start gap-1.5 text-[11px] text-warning">
              <FiInfo size={11} className="mt-0.5 shrink-0" />
              Storing on {storageChain.name} needs a connected{" "}
              {storageChain.family} wallet in addition to the anchoring wallet.
            </p>
          )}
          {paymentMethod !== "payg" && (
            <p className="mt-2 inline-flex items-start gap-1.5 text-[11px] text-muted">
              <FiInfo size={11} className="mt-0.5 shrink-0" />
              Hosted anchoring (credits / provider keys) never receives your
              bytes — on-chain storage sends transactions from your wallet, so
              switch to pay-as-you-go to store.
            </p>
          )}
        </>
      )}

      {mode === "external" && (
        <div className="mt-3">
          <label
            htmlFor="storage-external-uri"
            className="text-[10px] font-semibold uppercase tracking-wider text-muted"
          >
            Where the bytes live (optional)
          </label>
          <input
            id="storage-external-uri"
            type="text"
            value={externalUri}
            disabled={disabled}
            onChange={(event) => onExternalUriChange(event.target.value)}
            placeholder="ipfs://bafy… · Auto Drive CID · https://…"
            className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <p className="mt-1.5 text-[11px] text-muted">
            Carried in the file anchor&apos;s <code className="font-mono">uri</code>{" "}
            field on every chain, so readers can find your copy.
          </p>
        </div>
      )}

      {mode === "none" && (
        <p className="mt-3 inline-flex items-start gap-1.5 text-[11px] text-muted">
          <FiInfo size={11} className="mt-0.5 shrink-0" />
          The anchors prove the file existed, but nobody can rebuild it from
          the chain. Anyone holding bytes that hash to the anchored CIDs still
          holds the file.
        </p>
      )}
    </div>
  );
};

export default StorageSelector;
