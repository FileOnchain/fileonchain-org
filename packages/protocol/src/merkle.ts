import { bytesToHex, hexToBytes, sha256 } from "./sha256";

/**
 * Merkle trees over SHA-256 digests — the inclusion-proof primitive behind
 * manifest receipts: one settlement transaction anchors a root; every
 * subject keeps an individually checkable proof.
 *
 * Construction (normative): leaves are lowercase-hex SHA-256 digests in
 * manifest order; parent = SHA-256(left || right) over the 64 raw bytes;
 * an odd node is paired with itself.
 */

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

/** Build a Merkle tree over SHA-256 leaf digests (lowercase hex). */
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
