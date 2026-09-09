import {
  getAdapter,
  getProfile,
  type EvidenceEnvelope,
  type Receipt,
} from "@fileonchain/protocol";
import { EVIDENCE_PROTOCOL, EVIDENCE_PACKAGE_VERSION, type EvidencePackage } from "@fileonchain/utils";
import type { EvidenceSummary, ReportReceiptLine, VerificationInputs } from "./report";

/**
 * Builders for {@link EvidenceSummary} — the "what was verified" block a
 * report carries so it can be rendered standalone (a receipt, a badge, a
 * card) without going back to the document.
 *
 * Every value is copied from the verified document. The only judgement
 * made here is whether an adapter or profile is *registered* with this
 * verifier, which is exactly the fact the check results already report
 * as `unknown`. Payload fields are read only when they have the type the
 * reference adapters define; anything else is left out rather than
 * coerced.
 */

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const optionalNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const receiptLine = (receipt: Receipt, index: number): ReportReceiptLine => {
  const payload = receipt.payload as Record<string, unknown>;
  const line: ReportReceiptLine = {
    name: `${receipt.type}[${index}]:${receipt.adapter}`,
    type: receipt.type,
    adapter: receipt.adapter,
    adapterKnown: getAdapter(receipt.adapter) !== undefined,
  };
  // `system` is the receipt's own field; the reference anchor adapters
  // also carry the registry chain id in `payload.chainId`, which a legacy
  // receipt may have as its only system identifier.
  const system = optionalString(receipt.system) ?? optionalString(payload.chainId);
  if (system) line.system = system;
  const txHash = optionalString(payload.txHash);
  if (txHash) line.txHash = txHash;
  const blockNumber = optionalNumber(payload.blockNumber);
  if (blockNumber !== undefined) line.blockNumber = blockNumber;
  const timestamp = optionalString(payload.timestamp);
  if (timestamp) line.timestamp = timestamp;
  const uri = optionalString(payload.uri);
  if (uri) line.uri = uri;
  const root = optionalString(payload.root);
  if (root) line.root = root;
  return line;
};

/** Summarize a protocol envelope. Receipt indices follow the verifier's flat storage → settlement → inclusion order. */
export const summarizeEnvelope = (
  envelope: EvidenceEnvelope,
  inputs: VerificationInputs,
): EvidenceSummary => {
  const allReceipts: Receipt[] = [
    ...envelope.receipts.storage,
    ...envelope.receipts.settlement,
    ...envelope.receipts.inclusion,
  ];
  const subject = envelope.subject;
  const summary: EvidenceSummary = {
    format: "envelope",
    protocol: envelope.protocol,
    version: envelope.version,
    subject: {
      type: subject.type,
      ...(subject.name ? { name: subject.name } : {}),
      ...(subject.digests?.sha256 ? { sha256: subject.digests.sha256 } : {}),
      ...(subject.cid ? { cid: subject.cid } : {}),
      ...(subject.uri ? { uri: subject.uri } : {}),
      ...(subject.mediaType ? { mediaType: subject.mediaType } : {}),
      ...(subject.size !== undefined ? { size: subject.size } : {}),
    },
    artifactSignatures: envelope.signatures.length,
    envelopeSignatures: envelope.envelope?.signatures.length ?? 0,
    receipts: allReceipts.map(receiptLine),
    inputs,
  };
  if (envelope.id) summary.id = envelope.id;
  if (envelope.profile) {
    summary.profile = envelope.profile;
    summary.profileKnown = getProfile(envelope.profile) !== undefined;
  }
  if (envelope.createdAt) summary.createdAt = envelope.createdAt;
  if (envelope.envelope) summary.envelopeDigest = envelope.envelope.digest.sha256;
  return summary;
};

/**
 * Summarize a legacy-evidence-v1 package. Legacy receipts have no adapter
 * field; the line names mirror the check names the legacy verifier emits
 * (`storage[i]`, `settlement[i]`, `merkle-inclusion`), and the adapter column
 * carries the legacy format name so a renderer can label them honestly.
 */
export const summarizeLegacyPackage = (
  pkg: EvidencePackage,
  inputs: VerificationInputs,
): EvidenceSummary => {
  const receipts: ReportReceiptLine[] = [];
  for (const [i, storage] of pkg.storage.entries()) {
    receipts.push({
      name: `storage[${i}]`,
      type: "storage",
      adapter: "legacy-evidence-v1",
      adapterKnown: true,
      ...(storage.chainId ? { system: storage.chainId } : {}),
      ...(storage.uri ? { uri: storage.uri } : {}),
    });
  }
  for (const [i, settlement] of pkg.settlements.entries()) {
    receipts.push({
      name: `settlement[${i}]`,
      type: "settlement",
      adapter: "legacy-evidence-v1",
      adapterKnown: true,
      system: settlement.chainId,
      txHash: settlement.txHash,
      ...(settlement.blockNumber !== undefined ? { blockNumber: settlement.blockNumber } : {}),
      ...(settlement.timestamp ? { timestamp: settlement.timestamp } : {}),
    });
  }
  if (pkg.inclusion) {
    receipts.push({
      name: "merkle-inclusion",
      type: "inclusion",
      adapter: "legacy-evidence-v1",
      adapterKnown: true,
      root: pkg.inclusion.root,
    });
  }
  return {
    format: "legacy-evidence-v1",
    protocol: EVIDENCE_PROTOCOL,
    version: EVIDENCE_PACKAGE_VERSION,
    ...(pkg.sessionId ? { id: pkg.sessionId } : {}),
    createdAt: pkg.createdAt,
    subject: {
      type: "artifact",
      ...(pkg.artifact.name ? { name: pkg.artifact.name } : {}),
      sha256: pkg.artifact.sha256,
      cid: pkg.artifact.cid,
      ...(pkg.artifact.mediaType ? { mediaType: pkg.artifact.mediaType } : {}),
      ...(pkg.artifact.byteLength !== undefined ? { size: pkg.artifact.byteLength } : {}),
    },
    artifactSignatures: pkg.signatures.length,
    envelopeSignatures: 0,
    receipts,
    inputs,
  };
};
