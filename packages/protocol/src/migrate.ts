import { finalizeEnvelope } from "./envelope";
import {
  PROTOCOL_ID,
  PROTOCOL_VERSION,
  type EvidenceEnvelope,
  type InclusionReceipt,
  type SettlementReceipt,
  type StorageReceipt,
} from "./types";

/**
 * Migration from `legacy-evidence-v1` — the pre-separation FileOnChain
 * evidence package (`{ "p": "fileonchain-evidence", "v": 1 }`, flat
 * artifact descriptor with inline AI-ish metadata, chain-specific receipt
 * fields at the top level).
 *
 * Honesty rule: migration MUST NOT claim to preserve original signatures
 * as valid protocol signatures — the signed payload changes shape, so the
 * old signatures cannot verify against the new signing payload. They are
 * preserved verbatim as legacy signature records under
 * `extensions["org.fileonchain.legacy"]`, alongside a migration
 * statement, and the migrated envelope carries no artifact signatures of
 * its own. Callers may add a fresh envelope signature after migration.
 */

/** Structural shape of a legacy package (kept local — no dependency on the legacy implementation). */
export interface LegacyEvidencePackage {
  p: "fileonchain-evidence";
  v: 1;
  artifact: {
    cid: string;
    sha256: string;
    byteLength?: number;
    mediaType?: string;
    name?: string;
    metadata?: Record<string, string | number | boolean>;
  };
  signatures: unknown[];
  storage: Array<{
    mode: "evidence-only" | "onchain-storage" | "external-storage";
    uri?: string;
    chainId?: string;
    txHashes?: string[];
    provider?: string;
  }>;
  settlements: Array<{
    chainId: string;
    txHash: string;
    blockNumber?: number;
    blockHash?: string;
    timestamp?: string;
    payload?: string;
    submitter?: string;
  }>;
  inclusion?: {
    root: string;
    leafIndex: number;
    proof: string[];
    manifestHash?: string;
  };
  createdAt: string;
  sessionId?: string;
}

export const isLegacyEvidencePackage = (value: unknown): value is LegacyEvidencePackage => {
  const pkg = value as Partial<LegacyEvidencePackage> | null;
  return (
    !!pkg &&
    typeof pkg === "object" &&
    pkg.p === "fileonchain-evidence" &&
    pkg.v === 1 &&
    typeof (pkg as LegacyEvidencePackage).artifact === "object"
  );
};

/**
 * Map a legacy `chainId` (`"<family>:<ref>"`) to a system identifier.
 * EVM ids become CAIP-2 (`eip155:<chainId>`); other families keep the
 * legacy form, which adapters treat as a FileOnChain-namespaced system id.
 */
export const legacyChainIdToSystem = (chainId: string): string => {
  const [family, ref] = chainId.split(":");
  return family === "evm" ? `eip155:${ref}` : chainId;
};

export const LEGACY_STORAGE_ADAPTER_ID = "fileonchain-storage-legacy/v1" as const;
export const LEGACY_SETTLEMENT_ADAPTER_ID = "fileonchain-anchor-legacy/v1" as const;

export interface MigrateOptions {
  /** ISO 8601 timestamp recorded in the migration statement. */
  migratedAt: string;
}

/** Convert a legacy package into a finalized protocol envelope. */
export const migrateLegacyEvidence = (
  legacy: LegacyEvidencePackage,
  { migratedAt }: MigrateOptions,
): EvidenceEnvelope => {
  const storage: StorageReceipt[] = legacy.storage.map((receipt) => ({
    type: "storage",
    adapter: LEGACY_STORAGE_ADAPTER_ID,
    ...(receipt.chainId ? { system: legacyChainIdToSystem(receipt.chainId) } : {}),
    payload: { ...receipt },
  }));

  const settlement: SettlementReceipt[] = legacy.settlements.map((receipt) => ({
    type: "settlement",
    adapter: LEGACY_SETTLEMENT_ADAPTER_ID,
    system: legacyChainIdToSystem(receipt.chainId),
    payload: { ...receipt },
  }));

  const inclusion: InclusionReceipt[] = legacy.inclusion
    ? [
        {
          type: "inclusion",
          adapter: "fileonchain-merkle/v1",
          payload: {
            root: legacy.inclusion.root,
            leafIndex: legacy.inclusion.leafIndex,
            proof: legacy.inclusion.proof,
            ...(legacy.inclusion.manifestHash
              ? { manifestDigest: legacy.inclusion.manifestHash }
              : {}),
          },
        },
      ]
    : [];

  const claims: Record<string, unknown> = {};
  if (legacy.artifact.metadata || legacy.sessionId) {
    // The legacy descriptor mixed provenance into the artifact; the
    // migrated envelope keeps it as namespaced legacy claims rather than
    // guessing an application profile for it.
    claims["org.fileonchain.legacy"] = {
      ...(legacy.artifact.metadata ? { metadata: legacy.artifact.metadata } : {}),
      ...(legacy.sessionId ? { sessionId: legacy.sessionId } : {}),
    };
  }

  const envelope: EvidenceEnvelope = {
    protocol: PROTOCOL_ID,
    version: PROTOCOL_VERSION,
    subject: {
      type: "artifact",
      digests: { sha256: legacy.artifact.sha256 },
      cid: legacy.artifact.cid,
      ...(legacy.artifact.mediaType ? { mediaType: legacy.artifact.mediaType } : {}),
      ...(legacy.artifact.byteLength !== undefined ? { size: legacy.artifact.byteLength } : {}),
      ...(legacy.artifact.name ? { name: legacy.artifact.name } : {}),
    },
    ...(Object.keys(claims).length > 0 ? { claims } : {}),
    // Deliberately empty: the legacy signatures signed a different payload
    // shape and cannot verify against the protocol signing payload.
    signatures: [],
    receipts: { storage, settlement, inclusion },
    extensions: {
      "org.fileonchain.legacy": {
        migration: {
          from: "legacy-evidence-v1",
          migratedAt,
          note: "Original signatures are preserved verbatim below; they signed the legacy payload shape and are NOT valid protocol artifact signatures.",
        },
        signatures: legacy.signatures,
        original: { p: legacy.p, v: legacy.v, createdAt: legacy.createdAt },
      },
    },
    createdAt: legacy.createdAt,
  };

  return finalizeEnvelope(envelope);
};
