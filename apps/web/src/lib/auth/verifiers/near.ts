import "server-only";
import * as ed from "@noble/ed25519";
import { sha256 } from "@noble/hashes/sha2.js";
import { getChainsByFamily } from "@fileonchain/sdk";
import type { WalletVerificationInput } from "../verify-wallet";
import { NEAR_SIGN_RECIPIENT } from "../wallet-message";

/**
 * NEP-413 verification for NEAR `signMessage`. The wallet signs
 * sha256(borsh(Payload)) where Payload is tag-prefixed
 * { message, nonce[32], recipient, callbackUrl? }. The 32-byte nonce is
 * sha256 of our issued nonce string (see NEAR_SIGN_RECIPIENT docs). Because
 * NEAR keys are per-account, the provided key must also be a full-access
 * key on the claimed account — checked against the chain RPC (implicit
 * accounts short-circuit: the account id IS the key).
 */

/** 2^31 + 413 — the NEP-413 discriminant that makes payloads unlinkable
 * from transactions. */
const NEP413_TAG = 2147484061;

const borshPayload = (message: string, nonce32: Uint8Array, recipient: string): Uint8Array => {
  const messageBytes = new TextEncoder().encode(message);
  const recipientBytes = new TextEncoder().encode(recipient);
  const out = new Uint8Array(4 + 4 + messageBytes.length + 32 + 4 + recipientBytes.length + 1);
  const view = new DataView(out.buffer);
  let offset = 0;
  view.setUint32(offset, NEP413_TAG, true);
  offset += 4;
  view.setUint32(offset, messageBytes.length, true);
  offset += 4;
  out.set(messageBytes, offset);
  offset += messageBytes.length;
  out.set(nonce32, offset);
  offset += 32;
  view.setUint32(offset, recipientBytes.length, true);
  offset += 4;
  out.set(recipientBytes, offset);
  offset += recipientBytes.length;
  out[offset] = 0; // callbackUrl: None
  return out;
};

/** Does `publicKey` ("ed25519:…" form) exist as an access key on the
 * account? Asks each configured NEAR RPC until one knows the account. */
const keyBelongsToAccount = async (accountId: string, publicKey: string): Promise<boolean> => {
  for (const chain of getChainsByFamily("near")) {
    try {
      const res = await fetch(chain.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "fileonchain-auth",
          method: "query",
          params: {
            request_type: "view_access_key",
            finality: "final",
            account_id: accountId,
            public_key: publicKey,
          },
        }),
      });
      const body = (await res.json()) as {
        result?: { error?: string; permission?: unknown };
        error?: unknown;
      };
      if (body.result && !body.result.error && body.result.permission) return true;
    } catch {
      // RPC down — try the next network.
    }
  }
  return false;
};

export const verifyNear = async (
  input: WalletVerificationInput,
  message: string,
): Promise<boolean> => {
  if (!input.publicKey?.startsWith("ed25519:")) {
    throw new Error("NEAR verification requires an ed25519:… public key");
  }
  const { base58Decode } = await import("@polkadot/util-crypto");
  const publicKey = base58Decode(input.publicKey.slice("ed25519:".length));
  if (publicKey.length !== 32) {
    throw new Error("Malformed NEAR public key");
  }

  const nonce32 = sha256(new TextEncoder().encode(input.nonce));
  const digest = sha256(borshPayload(message, nonce32, NEAR_SIGN_RECIPIENT));
  const signature = Uint8Array.from(Buffer.from(input.signature, "base64"));
  if (!ed.verify(signature, digest, publicKey)) return false;

  // Implicit accounts are the hex of their key; named accounts need the
  // RPC access-key check.
  const accountId = input.address.toLowerCase();
  if (/^[0-9a-f]{64}$/.test(accountId)) {
    return Buffer.from(publicKey).toString("hex") === accountId;
  }
  return keyBelongsToAccount(accountId, input.publicKey);
};
