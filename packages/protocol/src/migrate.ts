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
/**
 * Migrated legacy inclusion proofs use the pre-separation Merkle scheme
 * (no leaf/internal domain separation, odd-node self-pairing) and cannot
 * verify under `fileonchain-merkle/v1`, so migration tags them with this
 * adapter id instead. The reference verifier registers an adapter for it
 * that checks the legacy scheme.
 */
export const LEGACY_INCLUSION_ADAPTER_ID = "fileonchain-merkle-legacy/v1" as const;

const HEX_64 = /^[0-9a-f]{64}$/;
const LEGACY_STORAGE_MODES = new Set(["evidence-only", "onchain-storage", "external-storage"]);

/**
 * Structural validation of a legacy-evidence-v1 package. Returns a list
 * of problems; empty = structurally valid. Migration refuses invalid
 * input rather than producing a plausible-looking envelope from it.
 */
export const validateLegacyEvidencePackage = (value: unknown): string[] => {
  const errors: string[] = [];
  const pkg = value as Partial<LegacyEvidencePackage> | null;
  if (!pkg || typeof pkg !== "object") return ["not an object"];
  if (pkg.p !== "fileonchain-evidence") errors.push('p must be "fileonchain-evidence"');
  if (pkg.v !== 1) errors.push("v must be 1");

  const artifact = pkg.artifact as Partial<LegacyEvidencePackage["artifact"]> | undefined;
  if (!artifact || typeof artifact !== "object") {
    errors.push("artifact missing");
  } else {
    if (typeof artifact.cid !== "string" || artifact.cid.length === 0) {
      errors.push("artifact.cid missing");
    }
    if (typeof artifact.sha256 !== "string" || !HEX_64.test(artifact.sha256)) {
      errors.push("artifact.sha256 is not 64 lowercase hex chars");
    }
    if (
      artifact.byteLength !== undefined &&
      (!Number.isInteger(artifact.byteLength) || artifact.byteLength < 0)
    ) {
      errors.push("artifact.byteLength must be a non-negative integer");
    }
  }

  if (!Array.isArray(pkg.signatures)) errors.push("signatures must be an array");

  if (!Array.isArray(pkg.storage)) {
    errors.push("storage must be an array");
  } else {
    pkg.storage.forEach((receipt, i) => {
      if (!receipt || typeof receipt !== "object" || !LEGACY_STORAGE_MODES.has(receipt.mode)) {
        errors.push(`storage[${i}].mode must be evidence-only|onchain-storage|external-storage`);
      }
    });
  }

  if (!Array.isArray(pkg.settlements)) {
    errors.push("settlements must be an array");
  } else {
    pkg.settlements.forEach((receipt, i) => {
      if (!receipt || typeof receipt !== "object") {
        errors.push(`settlements[${i}] must be an object`);
        return;
      }
      if (typeof receipt.chainId !== "string" || receipt.chainId.length === 0) {
        errors.push(`settlements[${i}].chainId missing`);
      }
      if (typeof receipt.txHash !== "string" || receipt.txHash.length === 0) {
        errors.push(`settlements[${i}].txHash missing`);
      }
    });
  }

  if (pkg.inclusion !== undefined) {
    const inclusion = pkg.inclusion as Partial<NonNullable<LegacyEvidencePackage["inclusion"]>> | null;
    if (!inclusion || typeof inclusion !== "object") {
      errors.push("inclusion must be an object");
    } else {
      if (typeof inclusion.root !== "string" || !HEX_64.test(inclusion.root)) {
        errors.push("inclusion.root is not 64 lowercase hex chars");
      }
      if (!Number.isInteger(inclusion.leafIndex) || (inclusion.leafIndex as number) < 0) {
        errors.push("inclusion.leafIndex must be a non-negative integer");
      }
      if (!Array.isArray(inclusion.proof)) errors.push("inclusion.proof must be an array");
    }
  }

  if (typeof pkg.createdAt !== "string" || pkg.createdAt.length === 0) {
    errors.push("createdAt missing");
  }
  return errors;
};

export interface MigrateOptions {
  /** ISO 8601 timestamp recorded in the migration statement. */
  migratedAt: string;
}

/** Convert a legacy package into a finalized protocol envelope. */
export const migrateLegacyEvidence = (
  legacy: LegacyEvidencePackage,
  { migratedAt }: MigrateOptions,
): EvidenceEnvelope => {
  const problems = validateLegacyEvidencePackage(legacy);
  if (problems.length > 0) {
    throw new Error(
      `Refusing to migrate an invalid legacy-evidence-v1 package: ${problems.join("; ")}`,
    );
  }

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
          // The legacy Merkle scheme differs from fileonchain-merkle/v1
          // (see LEGACY_INCLUSION_ADAPTER_ID above) — never present a
          // legacy proof under the current adapter id.
          type: "inclusion",
          adapter: LEGACY_INCLUSION_ADAPTER_ID,
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
