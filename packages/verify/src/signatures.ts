import { ed25519 } from "@noble/curves/ed25519";
import { verifyMessage } from "viem";
import { hexToBytes, type SignerIdentity } from "@fileonchain/protocol";

/**
 * Signature-scheme verification — isomorphic (browser, Node, edge):
 * EIP-191 recovers through viem, ed25519 verifies through noble-curves.
 * The *payload* being signed is scheme-independent; callers pass the
 * canonical signing-payload string.
 */

const textEncoder = new TextEncoder();

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
    const publicKey = hexToBytes(signer.publicKey);
    if (publicKey.length !== 32) {
      return { valid: false, detail: "ed25519 public key must be 32 bytes of hex" };
    }
    const valid = ed25519.verify(
      hexToBytes(signatureHex),
      textEncoder.encode(payload),
      publicKey,
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
