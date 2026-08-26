import { ed25519 } from "@noble/curves/ed25519.js";
import { verifyMessage } from "viem";
import { hexToBytes, type SignerIdentity } from "@fileonchain/protocol";

/**
 * Signature-scheme verification — isomorphic (browser, Node, edge):
 * EIP-191 recovers through viem, ed25519 verifies through noble-curves.
 * The *payload* being signed is scheme-independent; callers pass the
 * canonical signing-payload string.
 */

const textEncoder = new TextEncoder();

// The documented encodings are exact: 32-byte lowercase non-prefixed hex
// public keys and 64-byte lowercase non-prefixed hex signatures. Accepting
// case or prefix variants would make one signature record verify under
// several distinct byte forms.
const ED25519_PUBKEY_RE = /^[0-9a-f]{64}$/;
const ED25519_SIG_RE = /^[0-9a-f]{128}$/;

export const verifySchemeSignature = async (
  signer: SignerIdentity,
  payload: string,
  signatureHex: string,
): Promise<{ valid: boolean; detail: string }> => {
  if (signer.scheme === "eip191") {
    const valid = await verifyMessage({
      address: signer.publicKey as `0x${string}`,
      message: payload,
      signature: (signatureHex.startsWith("0x")
        ? signatureHex
        : `0x${signatureHex}`) as `0x${string}`,
    });
    return {
      valid,
      detail: valid
        ? `EIP-191 signature by ${signer.publicKey}`
        : `EIP-191 signature does not recover to ${signer.publicKey}`,
    };
  }
  if (signer.scheme === "ed25519") {
    if (!ED25519_PUBKEY_RE.test(signer.publicKey)) {
      return {
        valid: false,
        detail:
          "ed25519 public key must be 64 lowercase hex chars (32 bytes, no 0x prefix, no uppercase)",
      };
    }
    if (!ED25519_SIG_RE.test(signatureHex)) {
      return {
        valid: false,
        detail:
          "ed25519 signature must be 128 lowercase hex chars (64 bytes, no 0x prefix, no uppercase)",
      };
    }
    // Strict RFC 8032 verification (zip215: false): rejects non-canonical
    // encodings a consensus-lenient verifier would accept.
    const valid = ed25519.verify(
      hexToBytes(signatureHex),
      textEncoder.encode(payload),
      hexToBytes(signer.publicKey),
      { zip215: false },
    );
    return {
      valid,
      detail: valid
        ? `ed25519 signature by ${signer.publicKey}`
        : `ed25519 signature invalid for ${signer.publicKey}`,
    };
  }
  return { valid: false, detail: `unknown scheme "${(signer as SignerIdentity).scheme}"` };
};
