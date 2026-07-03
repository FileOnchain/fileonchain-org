"use client";

import * as React from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useFileUploader } from "@/hooks/useFileUploader";
import { useWalletStates } from "@/states/wallet";
import { truncateFileName } from "@/utils/truncateFileName";
import ConnectWalletModal from "./ConnectWalletModal";
import DropZone from "@/components/upload/DropZone";
import ChunkProgressList from "@/components/upload/ChunkProgressList";
import CostEstimatePanel from "@/components/upload/CostEstimatePanel";
import PaymentMethodSelector from "@/components/upload/PaymentMethodSelector";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CopyButton } from "@/components/ui/CopyButton";
import { StatusStepper, Step } from "@/components/ui/StatusStepper";
import CIDPreviewPanel from "@/components/registry/CIDPreviewPanel";
import { cn } from "@/lib/cn";

const SNIPPET_PREVIEW_CHARS = 500;
const FILE_NAME_MAX_LENGTH = 40;

const UPLOAD_STEPS: Step[] = [
  { id: "select", label: "1 · Select file", description: "Drop or pick a file to upload" },
  { id: "split", label: "2 · Split & hash", description: "Slice into 64KB chunks, SHA-256 each" },
  { id: "send", label: "3 · Send chunks", description: "One transaction per chunk on the chain" },
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
    setPaymentMethod,
    setByokKeyId,
    anchor,
    handleCidClick,
    processFile,
  } = useFileUploader();

  const selectedAccount = useWalletStates((state) => state.selectedAccount);
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
      : anchorStatus === "signing" || anchorStatus === "anchoring"
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

  const anchorBusy = anchorStatus === "signing" || anchorStatus === "anchoring";
  const anchorLabel =
    anchorStatus === "done"
      ? "Anchored ✓"
      : anchorStatus === "signing"
        ? "Waiting for signature…"
        : anchorStatus === "anchoring"
          ? paymentMethod === "payg"
            ? `Sending chunks ${anchorProgress}/${cids.length}…`
            : "Anchoring server-side…"
          : paymentMethod === "payg"
            ? "Sign & anchor"
            : paymentMethod === "credits"
              ? "Anchor with credits"
              : "Anchor via provider";

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

              <div className="mt-5 flex flex-wrap items-center gap-2">
                {paymentMethod === "payg" && (
                  <Button variant="secondary" onClick={() => setIsWalletModalOpen(true)}>
                    {selectedAccount
                      ? `${selectedAccount.address.slice(0, 6)}…${selectedAccount.address.slice(-4)}`
                      : "Connect wallet"}
                  </Button>
                )}
                <Button
                  onClick={() => void anchor()}
                  isLoading={anchorBusy}
                  disabled={cids.length === 0 || isUploading || anchorStatus === "done"}
                >
                  {anchorLabel}
                </Button>
                {anchorStatus === "done" && queue.length > 0 && (
                  <Button variant="secondary" onClick={() => void handleNextFile()}>
                    Next file ({queue.length} queued)
                  </Button>
                )}
                {queue.length > 0 && anchorStatus !== "done" && (
                  <span className="text-xs text-muted">
                    {queue.length} more {queue.length === 1 ? "file" : "files"} queued
                  </span>
                )}
              </div>
            </Card>

            <PaymentMethodSelector
              value={paymentMethod}
              byokKeyId={byokKeyId}
              chunkCount={Math.max(1, cids.length)}
              onChange={setPaymentMethod}
              onByokKeyChange={setByokKeyId}
            />

            {/* Cost estimate — only show once the chunk count is known.
                Falls back to the file's rough byte-to-chunk split before
                the split runs (assumes 64KB chunks). */}
            <CostEstimatePanel chunkCount={Math.max(1, cids.length > 0 ? cids.length : Math.ceil((file?.size ?? 0) / 65_536))} />

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

      <ConnectWalletModal isOpen={isWalletModalOpen} onClose={() => setIsWalletModalOpen(false)} />
    </div>
  );
};

export default FileUploader;