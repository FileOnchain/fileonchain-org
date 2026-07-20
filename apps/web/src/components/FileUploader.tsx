"use client";

import * as React from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { FiChevronDown } from "react-icons/fi";
import { useFileUploader } from "@/hooks/useFileUploader";
import { getFamilyAddress, useWalletStates } from "@/states/wallet";
import { truncateFileName } from "@/utils/truncateFileName";
import DropZone from "@/components/upload/DropZone";
import ChunkProgressList from "@/components/upload/ChunkProgressList";
import CostEstimatePanel from "@/components/upload/CostEstimatePanel";
import StorageSelector from "@/components/upload/StorageSelector";
import PaymentMethodSelector from "@/components/upload/PaymentMethodSelector";
import UploadManifest from "@/components/upload/UploadManifest";
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
  { id: "send", label: "3 · Store & send", description: "Bytes to the storage system, one anchor per chunk" },
  { id: "register", label: "4 · Register", description: "Write each tx hash into the registry contract" },
  { id: "done", label: "Done", description: "Indexed and retrievable from the chain" },
];

/**
 * StepHeader — ledger-style group rule for the upload decisions. The flow
 * really is a sequence (what you're uploading → where bytes live → who pays
 * → what it costs → sign), so the numbering carries information: the
 * manifest at the end is signable only once the numbered choices above it
 * are made.
 */
const StepHeader = ({
  n,
  label,
  hint,
}: {
  n: string;
  label: string;
  hint?: string;
}) => (
  <div className="mb-3 flex items-baseline gap-3">
    <span className="font-mono text-[10px] font-semibold tracking-[0.22em] text-primary">
      {n}
    </span>
    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
      {label}
    </p>
    <span aria-hidden className="hairline min-w-8 flex-1 self-center opacity-60" />
    {hint && <span className="text-[11px] text-muted">{hint}</span>}
  </div>
);

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
            className="space-y-8"
          >
            {/* 01 · FILE ------------------------------------------------ */}
            <section>
              <StepHeader
                n="01"
                label="File"
                hint={queue.length > 0 ? `${queue.length} more queued` : undefined}
              />
              <Card>
                <CardHeader>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="font-mono break-all">
                      {truncateFileName(file.name, FILE_NAME_MAX_LENGTH)}
                    </CardTitle>
                    <CardDescription>
                      {file.size.toLocaleString()} bytes · {file.type || "unknown type"}
                      {cids.length > 0 &&
                        ` · ${cids.length} × ${
                          chunkSize >= 1024
                            ? `${Math.round(chunkSize / 1024)} KiB`
                            : `${chunkSize} B`
                        } chunks`}
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
              </Card>
            </section>

            {/* Advisor — one actionable suggestion before the detailed
                selectors; Accept applies chain + payment, overriding below
                still works. Unnumbered: it's advice, not a step. */}
            <UploadAdvisor
              file={file}
              chunkCount={estimatedChunkCount}
              onApply={applyRecommendation}
            />

            {/* 02 · STORAGE --------------------------------------------- */}
            <section>
              <StepHeader n="02" label="Where the bytes live" />
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
            </section>

            {/* 03 · PAYMENT --------------------------------------------- */}
            <section>
              <StepHeader n="03" label="Who pays" />
              <PaymentMethodSelector
                value={paymentMethod}
                byokKeyId={byokKeyId}
                chunkCount={Math.max(1, cids.length)}
                onChange={setPaymentMethod}
                onByokKeyChange={setByokKeyId}
              />
            </section>

            {/* 04 · COST ------------------------------------------------ */}
            <section>
              <StepHeader n="04" label="Cost & extra chains" />
              <CostEstimatePanel chunkCount={estimatedChunkCount} />
            </section>

            {/* MANIFEST — the ledger line assembled from 01–04, with the
                one signing action. Errors surface here, next to the act. */}
            <section aria-live="polite">
              {error && (
                <p role="alert" className="mb-3 text-sm text-danger">
                  {error}
                </p>
              )}
              {chainNotActive && (
                <p role="alert" className="mb-3 text-sm text-warning">
                  {activeChain.name} is {activeChain.status} — anchoring isn&apos;t open
                  on it yet. Pick an active chain from the network switcher.
                </p>
              )}
              <UploadManifest
                fileName={file.name}
                chunkCount={Math.max(1, cids.length)}
                storageMode={storageMode}
                storageChain={storageChain}
                externalUri={externalUri}
                anchorChain={activeChain}
                paymentMethod={paymentMethod}
                anchorStatus={anchorStatus}
                anchorProgress={anchorProgress}
                storageTxHash={storageTxHash}
                txHash={preview?.txHash ?? null}
                connectedAddress={connectedAddress}
                disabled={
                  cids.length === 0 || isUploading || anchorStatus === "done" || chainNotActive
                }
                onConnect={() => setIsWalletModalOpen(true)}
                onAnchor={() => void anchor()}
              />
              {anchorStatus === "done" && queue.length > 0 && (
                <div className="mt-3 flex justify-end">
                  <Button variant="secondary" onClick={() => void handleNextFile()}>
                    Next file ({queue.length} queued)
                  </Button>
                </div>
              )}
            </section>

            <CIDPreviewPanel data={preview} />

            {/* Chunk trail — diagnostics, not a decision: collapsed by
                default so the flow stays four steps and a signature. */}
            {cids.length > 0 && (
              <details className="group rounded-lg border border-border bg-surface/60">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-muted transition-colors duration-base hover:text-foreground [&::-webkit-details-marker]:hidden">
                  <FiChevronDown
                    size={14}
                    className="shrink-0 transition-transform duration-base group-open:rotate-180"
                    aria-hidden
                  />
                  Chunk trail
                  <span className="ml-auto font-mono text-xs text-muted">
                    {cids.length} {cids.length === 1 ? "chunk" : "chunks"}
                  </span>
                </summary>
                <div className="border-t border-border p-4">
                  <ChunkProgressList
                    cids={cids}
                    onChunkClick={handleChunkClick}
                    selectedIndex={selectedChunkIndex}
                  />
                  {selectedCidData && (
                    <div className="mt-4">
                      <p className="mb-2 text-xs uppercase tracking-wide text-muted">
                        Chunk detail
                      </p>
                      <pre className={cn("bg-surface text-foreground p-3 rounded-md border border-border overflow-auto max-h-72 text-xs font-mono whitespace-pre-wrap break-all")}>
                        {JSON.stringify(selectedCidData, null, 2)}
                      </pre>
                      <div className="mt-3 flex justify-end">
                        <CopyButton
                          value={JSON.stringify(selectedCidData, null, 2)}
                          label="Copy JSON"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </details>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <ChainConnectModal open={isWalletModalOpen} onOpenChange={setIsWalletModalOpen} />
    </div>
  );
};

export default FileUploader;
