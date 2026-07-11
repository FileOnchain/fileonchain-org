import { verifyMerkleInclusion } from "./merkle";
import type { EvidenceEnvelope, Receipt, ReceiptType } from "./types";

/**
 * Receipt adapters and profile registration — the protocol's two
 * extension seams.
 *
 * The core schema never hardcodes system-specific receipt fields; an
 * adapter owns its payload format, offline checks, online checks,
 * finality behavior, and error states. Verifiers consult the registry;
 * receipts with no registered adapter are reported as *unknown*, never as
 * failures — unknown must be distinguishable from invalid.
 */

export type AdapterCheckStatus = "pass" | "fail" | "warning" | "unknown" | "skipped";

export interface AdapterCheckResult {
  status: AdapterCheckStatus;
  detail: string;
}

export interface OnlineCheckOptions {
  /** Override endpoints per system identifier (e.g. RPC URLs by CAIP-2 id). */
  endpoints?: Record<string, string>;
}

export interface ReceiptAdapter {
  /** Adapter identifier including major version, e.g. "fileonchain-evm-anchor/v1". */
  id: string;
  type: ReceiptType;
  /** Deterministic, local validation of the receipt payload. */
  checkOffline?(receipt: Receipt, envelope: EvidenceEnvelope): AdapterCheckResult;
  /** Network confirmation against the receipt's system (public endpoints only). */
  checkOnline?(
    receipt: Receipt,
    envelope: EvidenceEnvelope,
    options?: OnlineCheckOptions,
  ): Promise<AdapterCheckResult>;
}

const adapterRegistry = new Map<string, ReceiptAdapter>();

export const registerAdapter = (adapter: ReceiptAdapter): void => {
  adapterRegistry.set(adapter.id, adapter);
};

export const getAdapter = (id: string): ReceiptAdapter | undefined => adapterRegistry.get(id);

export const listAdapters = (): ReceiptAdapter[] => [...adapterRegistry.values()];

/* ------------------------------------------------------------------ */
/* Built-in adapter: Merkle inclusion (pure, no I/O)                   */
/* ------------------------------------------------------------------ */

export const MERKLE_INCLUSION_ADAPTER_ID = "fileonchain-merkle/v1" as const;

/**
 * Inclusion receipt payload for `fileonchain-merkle/v1`:
 * `{ root, leafIndex, proof[], leafDigest?, manifestDigest? }` — all
 * digests lowercase-hex SHA-256. When `leafDigest` is absent, the leaf is
 * the envelope subject's sha256 digest.
 */
export const merkleInclusionAdapter: ReceiptAdapter = {
  id: MERKLE_INCLUSION_ADAPTER_ID,
  type: "inclusion",
  checkOffline(receipt, envelope): AdapterCheckResult {
    const payload = receipt.payload as {
      root?: string;
      leafIndex?: number;
      proof?: string[];
      leafDigest?: string;
    };
    const leaf = payload.leafDigest ?? envelope.subject.digests?.sha256;
    if (!leaf) return { status: "fail", detail: "no leaf digest (payload or subject sha256)" };
    if (
      typeof payload.root !== "string" ||
      !Number.isInteger(payload.leafIndex) ||
      !Array.isArray(payload.proof)
    ) {
      return { status: "fail", detail: "payload needs root, leafIndex, proof[]" };
    }
    const included = verifyMerkleInclusion(
      leaf,
      payload.leafIndex as number,
      payload.proof,
      payload.root,
    );
    return included
      ? { status: "pass", detail: `leaf ${payload.leafIndex} proves into root ${payload.root}` }
      : { status: "fail", detail: "inclusion proof does not reach the root" };
  },
};

registerAdapter(merkleInclusionAdapter);

/* ------------------------------------------------------------------ */
/* Profile registration                                                */
/* ------------------------------------------------------------------ */

export interface ProfileDefinition {
  /** Profile identifier including major version, e.g. "org.fileonchain.agent/v1". */
  id: string;
  /** Claim namespace(s) the profile owns. */
  namespaces: string[];
  /**
   * Profile validation: returns problems with the envelope's use of the
   * profile (missing required claims, malformed fields). Empty = valid.
   */
  validate(envelope: EvidenceEnvelope): string[];
}

const profileRegistry = new Map<string, ProfileDefinition>();

export const registerProfile = (profile: ProfileDefinition): void => {
  profileRegistry.set(profile.id, profile);
};

export const getProfile = (id: string): ProfileDefinition | undefined => profileRegistry.get(id);

export const listProfiles = (): ProfileDefinition[] => [...profileRegistry.values()];
