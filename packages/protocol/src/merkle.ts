import { bytesToHex, hexToBytes, sha256 } from "./sha256";

/**
 * Merkle trees over SHA-256 digests — the inclusion-proof primitive behind
 * manifest receipts: one settlement transaction anchors a root; every
 * subject keeps an individually checkable proof.
 *
 * Construction (normative, RFC-6962-style):
 * - leaves are lowercase-hex SHA-256 digests in manifest order;
 * - leaf node   = SHA-256(0x00 ‖ leaf-digest bytes);
 * - internal    = SHA-256(0x01 ‖ left ‖ right) over the children's raw
 *   32-byte values;
 * - a lone node at the end of a level is promoted unchanged to the next
 *   level (never paired with itself).
 *
 * The domain-separation prefixes stop an internal node from being
 * presented as a leaf (second-preimage setup); promotion — instead of
 * odd-node self-duplication — stops distinct leaf sets from producing
 * the same root (root([a,b,c]) ≠ root([a,b,c,c]); CVE-2012-2459 class).
 * Because promotion skips levels, verification needs the tree's leaf
 * count (carried in the inclusion payload) and follows the RFC 9162
 * inclusion-proof algorithm.
 */

const LEAF_PREFIX = 0x00;
const NODE_PREFIX = 0x01;

const hashLeaf = (leafHex: string): string => {
  const digest = hexToBytes(leafHex);
  const buf = new Uint8Array(1 + digest.length);
  buf[0] = LEAF_PREFIX;
  buf.set(digest, 1);
  return bytesToHex(sha256(buf));
};

const hashPair = (left: string, right: string): string => {
  const buf = new Uint8Array(65);
  buf[0] = NODE_PREFIX;
  buf.set(hexToBytes(left), 1);
  buf.set(hexToBytes(right), 33);
  return bytesToHex(sha256(buf));
};

export interface MerkleTree {
  root: string;
  /** Number of leaves — proofs cannot be verified without it. */
  leafCount: number;
  /** Sibling path (leaf-to-root) for the given leaf index. */
  proofFor(leafIndex: number): string[];
}

/** Build a Merkle tree over SHA-256 leaf digests (lowercase hex). */
export const buildMerkleTree = (leaves: string[]): MerkleTree => {
  if (leaves.length === 0) throw new Error("Cannot build a Merkle tree with no leaves.");
  const levels: string[][] = [leaves.map((l) => hashLeaf(l.toLowerCase()))];
  while (levels[levels.length - 1].length > 1) {
    const prev = levels[levels.length - 1];
    const next: string[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      // A lone trailing node is promoted unchanged — never self-paired.
      next.push(i + 1 < prev.length ? hashPair(prev[i], prev[i + 1]) : prev[i]);
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
        // A promoted node has no sibling at this level — nothing to add.
        if (sibling < nodes.length) proof.push(nodes[sibling]);
        index = Math.floor(index / 2);
      }
      return proof;
    },
  };
};

/**
 * Check a leaf's inclusion proof against a root (RFC 9162 §2.1.3.2).
 * `leaf` is the subject's SHA-256 digest (lowercase hex), NOT a leaf-node
 * hash; `leafCount` is the tree's total number of leaves.
 */
export const verifyMerkleInclusion = (
  leaf: string,
  leafIndex: number,
  proof: string[],
  root: string,
  leafCount: number,
): boolean => {
  if (!Number.isInteger(leafIndex) || leafIndex < 0) return false;
  if (!Number.isInteger(leafCount) || leafCount < 1 || leafIndex >= leafCount) return false;
  let fn = leafIndex;
  let sn = leafCount - 1;
  let hash = hashLeaf(leaf.toLowerCase());
  for (const sibling of proof) {
    if (sn === 0) return false;
    if ((fn & 1) === 1 || fn === sn) {
      hash = hashPair(sibling.toLowerCase(), hash);
      if ((fn & 1) === 0) {
        while (fn !== 0 && (fn & 1) === 0) {
          fn >>= 1;
          sn >>= 1;
        }
      }
    } else {
      hash = hashPair(hash, sibling.toLowerCase());
    }
    fn >>= 1;
    sn >>= 1;
  }
  return sn === 0 && hash === root.toLowerCase();
};
