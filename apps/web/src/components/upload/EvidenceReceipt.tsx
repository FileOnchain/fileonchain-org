"use client";

import * as React from "react";
import type { ChainId } from "@fileonchain/sdk";
import { buildStorageUri } from "@fileonchain/sdk";
import type { VerificationReport } from "@fileonchain/verify";
import { Button } from "@/components/ui/Button";
import { ReceiptView } from "@/components/verify/ReceiptView";
import type { LandedAnchor, StorageMode } from "@/hooks/useFileUploader";

/**
 * EvidenceReceipt — the uploader's post-anchor state. Once a real anchor
 * has landed, this builds the same evidence envelope a developer would
 * seal with `@fileonchain/sdk/evidence` (subject from the file bytes, a
 * settlement receipt from the anchor, a storage receipt for the chosen
 * mode), runs the local verifier over it, and renders the report as the
 * receipt — the same component `/verify` uses.
 *
 * The envelope is unsigned: the wallet signed the anchoring transaction,
 * not the evidence, so the receipt honestly reports "no attribution" for
 * artifact signatures. The `.evidence.json` download is the portable
 * artifact; anyone can drop it on `/verify` or run `fileonchain verify`.
 * Simulated anchors never reach this component (see `FileUploader`).
 */

export interface EvidenceReceiptProps {
  file: File;
  cid: string | null;
  anchor: LandedAnchor;
  storageMode: StorageMode;
  storageChainId: ChainId | null;
  storageTxHash: string | null;
  externalUri: string;
}

const ENVELOPE_FILE = "evidence.json";

const EvidenceReceipt = ({
  file,
  cid,
  anchor,
  storageMode,
  storageChainId,
  storageTxHash,
  externalUri,
}: EvidenceReceiptProps) => {
  const [json, setJson] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<VerificationReport | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const [{ createEvidence, settlementReceiptFromAnchor, storageReceipt }, verify] =
          await Promise.all([import("@fileonchain/sdk/evidence"), import("@fileonchain/verify")]);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const storage =
          storageMode === "onchain" && storageChainId && cid
            ? storageReceipt({
                mode: "onchain-storage",
                uri: buildStorageUri(storageChainId, cid),
                chainId: storageChainId,
                ...(storageTxHash ? { txHashes: [storageTxHash] } : {}),
              })
            : storageMode === "external" && externalUri.trim()
              ? storageReceipt({ mode: "external-storage", uri: externalUri.trim() })
              : storageReceipt({ mode: "evidence-only" });
        const envelope = await createEvidence({
          subjectBytes: bytes,
          subjectMeta: {
            name: file.name,
            ...(file.type ? { mediaType: file.type } : {}),
            ...(cid ? { cid } : {}),
          },
          receipts: {
            storage: [storage],
            settlement: [
              settlementReceiptFromAnchor({
                chainId: anchor.chainId,
                txHash: anchor.txHash,
                ...(anchor.blockNumber !== undefined ? { blockNumber: anchor.blockNumber } : {}),
                timestamp: new Date(anchor.timestamp * 1000).toISOString(),
              }),
            ],
          },
          createdAt: new Date(anchor.timestamp * 1000).toISOString(),
        });
        const text = JSON.stringify(envelope, null, 2);
        // Verify the serialized form — exactly the bytes the download carries.
        const result = await verify.verifyEvidenceJson(text, { subjectBytes: bytes });
        if (cancelled) return;
        setJson(text);
        setReport(result);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not build the evidence envelope.");
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [file, cid, anchor, storageMode, storageChainId, storageTxHash, externalUri]);

  const downloadJson = () => {
    if (!json) return;
    const blob = new Blob([json], { type: "application/vnd.fileonchain.evidence+json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = ENVELOPE_FILE;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (error) {
    return (
      <p role="alert" className="text-sm text-warning">
        The anchor landed, but the evidence envelope could not be built: {error}
      </p>
    );
  }
  if (!report) return null;

  return (
    <section aria-label="Evidence receipt" className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
          Evidence
        </p>
        <span aria-hidden className="hairline min-w-8 flex-1 self-center opacity-60" />
        <Button size="sm" variant="secondary" onClick={downloadJson}>
          Download {ENVELOPE_FILE}
        </Button>
      </div>
      <ReceiptView
        report={report}
        envelopeFileName={ENVELOPE_FILE}
        subjectFileName={file.name}
      />
      <p className="text-[11px] text-muted">
        The envelope was built in your browser from the file bytes and the anchor that landed;
        the receipt is the local verifier&apos;s report on it. Drop the JSON on{" "}
        <a href="/verify" className="text-primary underline underline-offset-2">
          /verify
        </a>{" "}
        or run the command on the receipt to reproduce it.
      </p>
    </section>
  );
};

export default EvidenceReceipt;
