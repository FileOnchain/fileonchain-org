"use client";

import * as React from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { useFileUploader } from "@/hooks/useFileUploader";
import { getFamilyAddress, useWalletStates } from "@/states/wallet";
import { truncateFileName } from "@/utils/truncateFileName";
import DropZone from "@/components/upload/DropZone";
import ChunkProgressList from "@/components/upload/ChunkProgressList";
import CostEstimatePanel from "@/components/upload/CostEstimatePanel";
import StorageSelector from "@/components/upload/StorageSelector";
import PaymentMethodSelector from "@/components/upload/PaymentMethodSelector";
import FocatTopUp from "@/components/upload/FocatTopUp";
import UploadAdvisor, { type AdvisorApplyPayload } from "@/components/upload/UploadAdvisor";
import { useChain } from "@/hooks/useChain";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CopyButton } from "@/components/ui/CopyButton";
import { StatusStepper, Step } from "@/components/ui/StatusStepper";
import CIDPreviewPanel from "@/components/registry/CIDPreviewPanel";
import { cn } from "@/lib/cn";

// Same unified connect modal as the nav — loaded with `ssr: false` so the
// heavy chain SDK bundles never execute during SSR (see NavWallet).
const ChainConnectModal = dynamic(
  () => import("@/components/chain/ChainConnectModal").then((m) => m.ChainConnectModal),
  { ssr: false },
);

const SNIPPET_PREVIEW_CHARS = 500;
const FILE_NAME_MAX_LENGTH = 40;

const UPLOAD_STEPS: Step[] = [
  { id: "select", label: "1 · Select file", description: "Drop or pick a file to upload" },
  { id: "split", label: "2 · Split & hash", description: "Slice into chain-sized chunks, SHA-256 each" },
  { id: "send", label: "3 · Store & send", description: "Bytes to the storage chain, one anchor per chunk" },
  { id: "register", label: "4 · Register", description: "Write each tx hash into the registry contract" },
  { id: "done", label: "Done", description: "Indexed and retrievable from the chain" },
];

const FileUploader = () => {
  const {
    file,
    fileContent,
    cids,
    selectedCidData,
    error,
    fileFound,
    isUploading,
    preview,
    paymentMethod,
    byokKeyId,
    anchorStatus,
    anchorProgress,
    storageMode,
    storageChain,
    externalUri,
    chunkSize,
    storageTxHash,
    setStorageMode,
    setStorageChainId,
    setExternalUri,
    setPaymentMethod,
    setByokKeyId,
    anchor,
    handleCidClick,
    processFile,
  } = useFileUploader();

  const { activeChain, setActiveChainId } = useChain();
  const chainNotActive = activeChain.status !== "active";
  // Address of the wallet connected for the active chain's family — the one
  // that will actually sign the pay-as-you-go transactions.
  const connectedAddress = useWalletStates((state) =>
    getFamilyAddress(state, activeChain.family),
  );
  const [isWalletModalOpen, setIsWalletModalOpen] = React.useState(false);
  const [selectedChunkIndex, setSelectedChunkIndex] = React.useState<number | null>(null);
  // Extra files selected together queue up and advance after each anchor.
  const [queue, setQueue] = React.useState<File[]>([]);

  // Derive the current step: split while hashing, send while awaiting the
  // payment action, register while signing/anchoring, done when finished.
  const currentStep = !file
    ? "select"
    : isUploading
      ? "split"
      : anchorStatus === "signing" || anchorStatus === "storing" || anchorStatus === "anchoring"
        ? "register"
        : anchorStatus === "done"
          ? "done"
          : cids.length > 0
            ? "send"
            : "select";
  const stepStates = React.useMemo(() => {
    const idx = UPLOAD_STEPS.findIndex((s) => s.id === currentStep);
    return UPLOAD_STEPS.reduce<Record<string, "idle" | "active" | "done">>((acc, s, i) => {
      acc[s.id] = i < idx ? "done" : i === idx ? "active" : "idle";
      return acc;
    }, {});
  }, [currentStep]);

  const handleFiles = React.useCallback(
    async (selected: File[]) => {
      const [first, ...rest] = selected;
      if (!first) return;
      setQueue((prev) => [...prev, ...rest]);
      await processFile(first);
    },
    [processFile],
  );

  const handleNextFile = React.useCallback(async () => {
    const [next, ...rest] = queue;
    if (!next) return;
    setQueue(rest);
    setSelectedChunkIndex(null);
    await processFile(next);
  }, [queue, processFile]);

  const anchorBusy =
    anchorStatus === "signing" || anchorStatus === "storing" || anchorStatus === "anchoring";
  const anchorLabel =
    anchorStatus === "done"
      ? "Anchored ✓"
      : anchorStatus === "signing"
        ? "Waiting for signature…"
        : anchorStatus === "storing"
          ? `Storing bytes ${anchorProgress}/${cids.length}…`
          : anchorStatus === "anchoring"
            ? paymentMethod === "payg"
              ? `Sending chunks ${anchorProgress}/${cids.length}…`
              : "Anchoring server-side…"
            : paymentMethod === "payg"
              ? storageMode === "onchain"
                ? "Sign, store & anchor"
                : "Sign & anchor"
              : paymentMethod === "credits"
                ? "Anchor with credits"
                : "Anchor via provider";

  // Same chunk estimate the cost panel uses: real chunk count once the
  // split ran, a rough byte split at the current chunk size before that.
  const estimatedChunkCount = Math.max(
    1,
    cids.length > 0 ? cids.length : Math.ceil((file?.size ?? 0) / chunkSize),
  );

  const applyRecommendation = React.useCallback(
    ({ chainId, paymentMethod: method, byokKeyId: keyId }: AdvisorApplyPayload) => {
      setActiveChainId(chainId);
      setPaymentMethod(method);
      setByokKeyId(keyId ?? null);
    },
    [setActiveChainId, setPaymentMethod, setByokKeyId],
  );

  const handleChunkClick = React.useCallback(
    (chunk: (typeof cids)[number], index: number) => {
      setSelectedChunkIndex(index);
      handleCidClick(chunk.cid, chunk.data, chunk.nextCid);
    },
    [handleCidClick],
  );

  const renderSnippet = () => {
    if (!fileContent || !file) return null;
    if (file.type === "application/json") {
      try {
        const jsonSnippet = JSON.stringify(JSON.parse(fileContent), null, 2).slice(
          0,
          SNIPPET_PREVIEW_CHARS,
        );
        return (
          <pre className="bg-surface text-foreground p-4 rounded-md border border-border overflow-auto max-h-64 text-xs font-mono whitespace-pre-wrap break-all">
            {jsonSnippet}…
          </pre>
        );
      } catch {
        return <p className="text-danger text-sm">Invalid JSON file</p>;
      }
    }
    if (file.type.startsWith("text/")) {
      return (
        <pre className="bg-surface text-foreground p-4 rounded-md border border-border overflow-auto max-h-64 text-xs font-mono whitespace-pre-wrap break-all">
          {fileContent.slice(0, SNIPPET_PREVIEW_CHARS)}…
        </pre>
      );
    }
    if (file.type.startsWith("image/")) {
      return (
        <div className="flex justify-center">
          <Image src={fileContent} alt="Preview" width={300} height={300} className="rounded-md border border-border" />
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      {!file && <DropZone onFiles={handleFiles} />}

      <AnimatePresence>
        {file && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-6"
          >
            <Card>
              <CardHeader>
                <div className="min-w-0 flex-1">
                  <CardTitle className="font-mono break-all">
                    {truncateFileName(file.name, FILE_NAME_MAX_LENGTH)}
                  </CardTitle>
                  <CardDescription>
                    {file.size.toLocaleString()} bytes · {file.type || "unknown type"}
                  </CardDescription>
                </div>
                <Badge variant={fileFound ? "success" : "info"} size="sm">
                  {fileFound ? "Found onchain" : "Ready"}
                </Badge>
              </CardHeader>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted">Progress</p>
                  <StatusStepper steps={UPLOAD_STEPS} current={currentStep} states={stepStates} />
                </div>
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted">Preview</p>
                  {renderSnippet() ?? (
                    <p className="text-sm text-muted">No preview available for this file type.</p>
                  )}
                </div>
              </div>

              {error && (
                <p role="alert" className="mt-4 text-sm text-danger">
                  {error}
                </p>
              )}

              {chainNotActive && (
                <p role="alert" className="mt-4 text-sm text-warning">
                  {activeChain.name} is {activeChain.status} — anchoring isn&apos;t open
                  on it yet. Pick an active chain from the network switcher.
                </p>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-2">
                {paymentMethod === "payg" && (
                  <Button variant="secondary" onClick={() => setIsWalletModalOpen(true)}>
                    {connectedAddress
                      ? `${connectedAddress.slice(0, 6)}…${connectedAddress.slice(-4)}`
                      : "Connect wallet"}
                  </Button>
                )}
                <Button
                  onClick={() => void anchor()}
                  isLoading={anchorBusy}
                  disabled={
                    cids.length === 0 || isUploading || anchorStatus === "done" || chainNotActive
                  }
                >
                  {anchorLabel}
                </Button>
                {anchorStatus === "done" && queue.length > 0 && (
                  <Button variant="secondary" onClick={() => void handleNextFile()}>
                    Next file ({queue.length} queued)
                  </Button>
                )}
                {storageTxHash && (
                  <span className="font-mono text-[11px] text-muted">
                    stored · {storageTxHash.slice(0, 10)}…
                  </span>
                )}
                {queue.length > 0 && anchorStatus !== "done" && (
                  <span className="text-xs text-muted">
                    {queue.length} more {queue.length === 1 ? "file" : "files"} queued
                  </span>
                )}
              </div>
            </Card>

            {/* One actionable suggestion before the detailed selectors —
                Accept applies chain + payment; overriding below still works. */}
            <UploadAdvisor
              file={file}
              chunkCount={estimatedChunkCount}
              onApply={applyRecommendation}
            />

            {/* Where the bytes live — on-chain storage is the default;
                the storage chain drives the chunk size above. */}
            <StorageSelector
              fileSize={file.size}
              mode={storageMode}
              storageChain={storageChain}
              externalUri={externalUri}
              activeChain={activeChain}
              paymentMethod={paymentMethod}
              disabled={anchorBusy || anchorStatus === "done"}
              onModeChange={setStorageMode}
              onStorageChainChange={setStorageChainId}
              onExternalUriChange={setExternalUri}
            />

            <PaymentMethodSelector
              value={paymentMethod}
              byokKeyId={byokKeyId}
              chunkCount={Math.max(1, cids.length)}
              onChange={setPaymentMethod}
              onByokKeyChange={setByokKeyId}
            />

            {/* FOCAT enters the flow only where the wallet path requires
                it: PAYG on a propose/verify chain escrows tip + bond from
                the user's wallet. Credits users never see the token. */}
            {paymentMethod === "payg" && <FocatTopUp />}

            {/* Cost estimate — only show once the chunk count is known.
                Falls back to the file's rough byte-to-chunk split before
                the split runs (assumes 64KB chunks). */}
            <CostEstimatePanel chunkCount={estimatedChunkCount} />

            <CIDPreviewPanel data={preview} />

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Chunks</h3>
                {cids.length > 0 && (
                  <span className="text-xs text-muted">
                    {cids.length} {cids.length === 1 ? "chunk" : "chunks"}
                  </span>
                )}
              </div>
              <ChunkProgressList
                cids={cids}
                onChunkClick={handleChunkClick}
                selectedIndex={selectedChunkIndex}
              />
            </div>

            {selectedCidData && (
              <Card>
                <CardHeader>
                  <CardTitle>Chunk detail</CardTitle>
                </CardHeader>
                <pre className={cn("bg-surface text-foreground p-3 rounded-md border border-border overflow-auto max-h-72 text-xs font-mono whitespace-pre-wrap break-all")}>
                  {JSON.stringify(selectedCidData, null, 2)}
                </pre>
                <div className="mt-3 flex justify-end">
                  <CopyButton value={JSON.stringify(selectedCidData, null, 2)} label="Copy JSON" />
                </div>
              </Card>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <ChainConnectModal open={isWalletModalOpen} onOpenChange={setIsWalletModalOpen} />
    </div>
  );
};

export default FileUploader;