import { describe, expect, it } from "vitest";
import { buildMerkleTree, sha256HexUtf8, verifyMerkleInclusion } from "../src/index";

const leaves = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => sha256HexUtf8(`leaf-${i}`));

describe("merkle construction", () => {
  it("round-trips every leaf for tree sizes 1..8", () => {
    for (let n = 1; n <= 8; n += 1) {
      const set = leaves(n);
      const tree = buildMerkleTree(set);
      set.forEach((leaf, i) => {
        expect(verifyMerkleInclusion(leaf, i, tree.proofFor(i), tree.root, n)).toBe(true);
      });
    }
  });

  it("does not collide on duplicated trailing leaves (CVE-2012-2459 class)", () => {
    const [a, b, c] = leaves(3);
    expect(buildMerkleTree([a, b, c]).root).not.toBe(buildMerkleTree([a, b, c, c]).root);
  });

  it("domain-separates leaves from internal nodes", () => {
    const [a] = leaves(1);
    // A single-leaf root is SHA256(0x00 || leaf), never the raw digest.
    expect(buildMerkleTree([a]).root).not.toBe(a);
  });

  it("rejects an internal node presented as a leaf", () => {
    const [a, b, c, d] = leaves(4);
    const tree = buildMerkleTree([a, b, c, d]);
    // These ARE the 4-leaf tree's internal nodes.
    const leftNode = buildMerkleTree([a, b]).root;
    const rightNode = buildMerkleTree([c, d]).root;
    // Without domain separation this "2-leaf tree" proof would reach the
    // 4-leaf root; the 0x00 leaf prefix must make it fail.
    expect(verifyMerkleInclusion(leftNode, 0, [rightNode], tree.root, 2)).toBe(false);
    expect(verifyMerkleInclusion(rightNode, 1, [leftNode], tree.root, 2)).toBe(false);
  });

  it("rejects out-of-range and malformed indices", () => {
    const set = leaves(3);
    const tree = buildMerkleTree(set);
    expect(verifyMerkleInclusion(set[0], 3, tree.proofFor(0), tree.root, 3)).toBe(false);
    expect(verifyMerkleInclusion(set[0], -1, tree.proofFor(0), tree.root, 3)).toBe(false);
    expect(verifyMerkleInclusion(set[0], 0, tree.proofFor(0), tree.root, 0)).toBe(false);
    expect(verifyMerkleInclusion(set[0], 0.5, tree.proofFor(0), tree.root, 3)).toBe(false);
  });

  it("rejects a proof against the wrong root or truncated path", () => {
    const set = leaves(5);
    const tree = buildMerkleTree(set);
    const proof = tree.proofFor(2);
    expect(verifyMerkleInclusion(set[2], 2, proof, sha256HexUtf8("other"), 5)).toBe(false);
    expect(verifyMerkleInclusion(set[2], 2, proof.slice(0, -1), tree.root, 5)).toBe(false);
  });
});
