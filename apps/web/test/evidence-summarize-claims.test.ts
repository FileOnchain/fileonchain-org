import { describe, expect, it } from "vitest";
import type { EvidenceEnvelope } from "@fileonchain/protocol";
import { summarizeClaims } from "@/lib/server/evidence";

/** `summarizeClaims` builds the `claim_summary` JSON column that the
 *  Cloud evidence search + GIN `search_tsv` index key off. It's
 *  pure — same envelope in, same summary out — so we can drive it
 *  with hand-built fixtures. */

/** Minimal envelope shell. Only the fields `summarizeClaims` reads
 *  (`claims`, `signatures`, `envelope.signatures`) need to be set;
 *  every other property is omitted because the helper never looks
 *  at it. */
const envelope = (overrides: Partial<EvidenceEnvelope>): EvidenceEnvelope => ({
  protocol: "fileonchain-evidence",
  version: 1,
  subject: {
    type: "agent.run",
    digests: { sha256: "a".repeat(64) },
  },
  signatures: [],
  receipts: { receipts: [] },
  ...overrides,
});

describe("summarizeClaims", () => {
  it("returns the empty sets for an envelope with no claims + no signatures", () => {
    const summary = summarizeClaims(
      envelope({ claims: {}, signatures: [] }),
    );
    expect(summary).toEqual({ keys: [], namespaces: [], signers: [] });
  });

  it("flattens a single-namespace claim block to dotted keys", () => {
    const summary = summarizeClaims(
      envelope({
        claims: {
          "org.fileonchain.agent": { runId: "r_1", agentId: "a_1" },
        },
      }),
    );
    expect(summary.keys).toEqual([
      "org.fileonchain.agent.agentId",
      "org.fileonchain.agent.runId", // sorted alphabetically
    ]);
    expect(summary.namespaces).toEqual(["org.fileonchain.agent"]);
    expect(summary.signers).toEqual([]);
  });

  it("collects across multiple namespaces and sorts the output", () => {
    const summary = summarizeClaims(
      envelope({
        claims: {
          "org.fileonchain.agent": { runId: "r" },
          "org.example.custom": { foo: "x", bar: "y" },
        },
      }),
    );
    expect(summary.namespaces).toEqual([
      "org.example.custom",
      "org.fileonchain.agent",
    ]);
    expect(summary.keys).toEqual([
      "org.example.custom.bar",
      "org.example.custom.foo",
      "org.fileonchain.agent.runId",
    ]);
  });

  it("dedupes signer ids across artifact + envelope signature lists", () => {
    const summary = summarizeClaims(
      envelope({
        signatures: [
          {
            signer: {
              kind: "service",
              id: "fileonchain:producer",
              publicKey: "0xabc",
              scheme: "ed25519",
            },
            payloadDigest: "f".repeat(64),
            signature: "00",
          },
          {
            signer: {
              kind: "user",
              id: "did:key:abc",
              publicKey: "0xdef",
              scheme: "ed25519",
            },
            payloadDigest: "e".repeat(64),
            signature: "11",
          },
        ],
        envelope: {
          digest: { sha256: "d".repeat(64) },
          signatures: [
            {
              // Same `producer` id as the artifact signature above —
              // should collapse to one entry in the output.
              signer: {
                kind: "service",
                id: "fileonchain:producer",
                publicKey: "0xabc",
                scheme: "ed25519",
              },
              payloadDigest: "c".repeat(64),
              signature: "22",
            },
          ],
        },
      }),
    );
    expect(summary.signers).toEqual([
      "did:key:abc",
      "fileonchain:producer",
    ]);
  });

  it("ignores signatures whose signer has no `id`", () => {
    const summary = summarizeClaims(
      envelope({
        signatures: [
          {
            // `publicKey` is the identity when `id` is absent — not
            // surfaced as a signer id by the helper.
            signer: {
              kind: "user",
              publicKey: "0xpubkey",
              scheme: "ed25519",
            },
            payloadDigest: "f".repeat(64),
            signature: "00",
          },
        ],
      }),
    );
    expect(summary.signers).toEqual([]);
  });

  it("passes through a missing claims map", () => {
    // A draft envelope (no claims) is valid input — the helper
    // should not crash.
    const summary = summarizeClaims(envelope({}));
    expect(summary).toEqual({ keys: [], namespaces: [], signers: [] });
  });
});
