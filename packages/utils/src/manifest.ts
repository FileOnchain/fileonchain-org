import { ANCHOR_PAYLOAD_VERSION, ANCHOR_PROTOCOL } from "./anchor";
import { canonicalStringify } from "./evidence";
import { bytesToHex, hexToBytes, sha256, sha256HexUtf8 } from "./sha256";

/**
 * Manifests and batch anchoring.
 *
 * Agent and workflow use cases produce many small artifacts; one settlement
 * transaction per artifact is wasteful. A manifest lists the artifacts of a
 * workflow, a Merkle tree is built over their SHA-256 hashes, and a single
 * settlement transaction anchors the root. Each artifact's evidence package
 * then carries a `MerkleInclusion` proof, so one transaction anchors
 * hundreds or thousands of artifacts while every artifact keeps an
 * individually checkable proof.
 *
 * Tree construction (v1): leaves are the artifacts' SHA-256 digests in
 * manifest order; parent = SHA-256(left || right); an odd node is paired
 * with itself. Hashes are lowercase hex throughout.
 */

export const MANIFEST_PROTOCOL = "fileonchain-manifest" as const;
export const MANIFEST_VERSION = 1 as const;

/** One artifact entry in a manifest. */
export interface ManifestEntry {
  /** CIDv1 of the artifact. */
  cid: string;
  /** SHA-256 (hex) of the artifact's raw bytes — the Merkle leaf. */
  sha256: string;
  name?: string;
  /** Flat provenance metadata, same shape as the evidence package's. */
  metadata?: Record<string, string | number | boolean>;
}

/**
 * The manifest document — a portable JSON file listing a workflow's
 * artifacts. Its canonical SHA-256 (`manifestHash`) travels in the anchor
 * payload so a verifier can bind the on-chain root to this exact list.
 */
export interface ManifestDocument {
  p: typeof MANIFEST_PROTOCOL;
  v: typeof MANIFEST_VERSION;
  /** Workflow / session identifier shared by the artifacts. */
  sessionId?: string;
  /** Merkle root (hex) of a parent manifest, for hierarchical evidence. */
  parentRoot?: string;
  artifacts: ManifestEntry[];
  /** Creation time (ISO 8601) — asserted; settlement receipts prove time. */
  createdAt: string;
}

/** Manifest anchor payload — one settlement transaction for N artifacts. */
export interface ManifestAnchorPayload {
  p: typeof ANCHOR_PROTOCOL;
  v: typeof ANCHOR_PAYLOAD_VERSION;
  op: "manifest";
  /** Merkle root (hex) over the manifest's artifact hashes. */
  root: string;
  /** Number of artifacts under the root. */
  count: number;
  /** SHA-256 (hex) of the canonical manifest document. */
  mh?: string;
  /** Workflow / session identifier. */
  sid?: string;
}

/* ------------------------------------------------------------------ */
/* Merkle tree                                                         */
/* ------------------------------------------------------------------ */

const hashPair = (left: string, right: string): string => {
  const combined = new Uint8Array(64);
  combined.set(hexToBytes(left));
  combined.set(hexToBytes(right), 32);
  return bytesToHex(sha256(combined));
};

export interface MerkleTree {
  root: string;
  /** Number of leaves. */
  leafCount: number;
  /** Sibling path (leaf-to-root) for the given leaf index. */
  proofFor(leafIndex: number): string[];
}

/** Build a Merkle tree over SHA-256 leaf hashes (lowercase hex). */
export const buildMerkleTree = (leaves: string[]): MerkleTree => {
  if (leaves.length === 0) throw new Error("Cannot build a Merkle tree with no leaves.");
  const levels: string[][] = [leaves.map((l) => l.toLowerCase())];
  while (levels[levels.length - 1].length > 1) {
    const prev = levels[levels.length - 1];
    const next: string[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      next.push(hashPair(prev[i], prev[i + 1] ?? prev[i]));
    }
    levels.push(next);
  }
  return {
    root: levels[levels.length - 1][0],
    leafCount: leaves.length,
    proofFor(leafIndex: number): string[] {
      if (leafIndex < 0 || leafIndex >= leaves.length) {
        throw new Error(`Leaf index ${leafIndex} out of range.`);
      }
      const proof: string[] = [];
      let index = leafIndex;
      for (let level = 0; level < levels.length - 1; level += 1) {
        const nodes = levels[level];
        const sibling = index % 2 === 0 ? index + 1 : index - 1;
        proof.push(nodes[sibling] ?? nodes[index]);
        index = Math.floor(index / 2);
      }
      return proof;
    },
  };
};

/** Check a leaf's inclusion proof against a root. */
export const verifyMerkleInclusion = (
  leaf: string,
  leafIndex: number,
  proof: string[],
  root: string,
): boolean => {
  let hash = leaf.toLowerCase();
  let index = leafIndex;
  for (const sibling of proof) {
    hash = index % 2 === 0 ? hashPair(hash, sibling) : hashPair(sibling, hash);
    index = Math.floor(index / 2);
  }
  return hash === root.toLowerCase();
};

/* ------------------------------------------------------------------ */
/* Manifest helpers                                                    */
/* ------------------------------------------------------------------ */

export interface BuildManifestParams {
  artifacts: ManifestEntry[];
  createdAt: string;
  sessionId?: string;
  parentRoot?: string;
}

export interface BuiltManifest {
  document: ManifestDocument;
  /** SHA-256 (hex) of the canonical document — bind receipts to this. */
  manifestHash: string;
  tree: MerkleTree;
  /** Serialized anchor payload for the settlement transaction. */
  anchorPayload: string;
}

/** Assemble a manifest, its Merkle tree, and its anchor payload. */
export const buildManifest = ({
  artifacts,
  createdAt,
  sessionId,
  parentRoot,
}: BuildManifestParams): BuiltManifest => {
  if (artifacts.length === 0) throw new Error("A manifest needs at least one artifact.");
  const document: ManifestDocument = {
    p: MANIFEST_PROTOCOL,
    v: MANIFEST_VERSION,
    artifacts,
    createdAt,
  };
  if (sessionId) document.sessionId = sessionId;
  if (parentRoot) document.parentRoot = parentRoot;

  const manifestHash = sha256HexUtf8(canonicalStringify(document));
  const tree = buildMerkleTree(artifacts.map((a) => a.sha256));
  const payload: ManifestAnchorPayload = {
    p: ANCHOR_PROTOCOL,
    v: ANCHOR_PAYLOAD_VERSION,
    op: "manifest",
    root: tree.root,
    count: artifacts.length,
    mh: manifestHash,
  };
  if (sessionId) payload.sid = sessionId;
  return { document, manifestHash, tree, anchorPayload: JSON.stringify(payload) };
};

/** Parse a manifest anchor payload; null if it isn't one. */
export const parseManifestAnchorPayload = (raw: string): ManifestAnchorPayload | null => {
  try {
    const parsed = JSON.parse(raw) as Partial<ManifestAnchorPayload>;
    if (parsed.p !== ANCHOR_PROTOCOL || parsed.v !== ANCHOR_PAYLOAD_VERSION) return null;
    if (parsed.op !== "manifest") return null;
    if (typeof parsed.root !== "string" || typeof parsed.count !== "number") return null;
    return parsed as ManifestAnchorPayload;
  } catch {
    return null;
  }
};
