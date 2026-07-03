import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { verifyMessage as verifyEvmMessage } from "viem";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { sha3_256 } from "@noble/hashes/sha3.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import type { ChainFamily } from "@fileonchain/sdk";
import { db, authNonces } from "@/lib/db";
import { buildWalletMessage, normalizeAddress } from "./wallet-message";

// @noble/ed25519 v3 needs an explicit SHA-512 implementation.
ed.hashes.sha512 = sha512;

export interface WalletVerificationInput {
  family: ChainFamily;
  address: string;
  signature: string;
  nonce: string;
  /** Required for aptos (hex ed25519 key); unused elsewhere. */
  publicKey?: string;
  /**
   * Aptos wallets (Petra/Martian) sign their own envelope around our message
   * — they return it as `fullMessage`, which is what the signature covers.
   */
  fullMessage?: string;
}

export type WalletVerificationResult =
  | { ok: true; address: string; message: string }
  | { ok: false; error: string };

const utf8 = (value: string): Uint8Array => new TextEncoder().encode(value);

const stripHex = (value: string): string =>
  value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;

/**
 * Verify a wallet sign-in/link challenge: atomically consume the nonce, then
 * check the signature per chain family. Shared by the Credentials provider
 * and the authenticated wallet-link endpoint.
 */
export const verifyWalletSignature = async (
  input: WalletVerificationInput,
): Promise<WalletVerificationResult> => {
  const address = normalizeAddress(input.family, input.address);

  // Single-use consume: only an unused, unexpired nonce issued for exactly
  // this family+address can flip to used — concurrent replays lose the race.
  const [nonceRow] = await db
    .update(authNonces)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(authNonces.nonce, input.nonce),
        eq(authNonces.family, input.family),
        eq(authNonces.address, address),
        isNull(authNonces.usedAt),
        gt(authNonces.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!nonceRow) {
    return { ok: false, error: "Nonce is unknown, expired, or already used" };
  }

  const message = buildWalletMessage({
    family: input.family,
    address: input.address,
    nonce: input.nonce,
    issuedAt: nonceRow.createdAt.toISOString(),
  });

  try {
    const valid = await verifyForFamily(input, message);
    if (!valid) return { ok: false, error: "Signature verification failed" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Malformed signature",
    };
  }

  return { ok: true, address, message };
};

const verifyForFamily = async (
  input: WalletVerificationInput,
  message: string,
): Promise<boolean> => {
  switch (input.family) {
    case "evm":
      return verifyEvmMessage({
        address: input.address as `0x${string}`,
        message,
        signature: input.signature as `0x${string}`,
      });

    case "substrate": {
      const { cryptoWaitReady, signatureVerify } = await import(
        "@polkadot/util-crypto"
      );
      const { u8aWrapBytes } = await import("@polkadot/util");
      await cryptoWaitReady();
      // polkadot-js extensions wrap signRaw payloads in <Bytes>…</Bytes>;
      // accept both wrapped and raw so bare signers also verify.
      return (
        signatureVerify(u8aWrapBytes(message), input.signature, input.address)
          .isValid ||
        signatureVerify(message, input.signature, input.address).isValid
      );
    }

    case "solana": {
      const { base58Decode } = await import("@polkadot/util-crypto");
      const publicKey = base58Decode(input.address);
      const signature = Uint8Array.from(
        Buffer.from(input.signature, "base64"),
      );
      return ed.verify(signature, utf8(message), publicKey);
    }

    case "aptos": {
      if (!input.publicKey || !input.fullMessage) {
        throw new Error("Aptos verification requires publicKey and fullMessage");
      }
      // The wallet signs its own APTOS envelope; our nonce inside it proves
      // freshness, and the signature covers the whole envelope.
      if (!input.fullMessage.includes(input.nonce)) {
        throw new Error("Signed message does not contain the issued nonce");
      }
      const publicKey = hexToBytes(stripHex(input.publicKey));
      // Aptos account address = sha3-256(pubkey ‖ 0x00) for single-key ed25519.
      const derived = sha3_256(
        new Uint8Array([...publicKey, 0x00]),
      );
      const derivedAddress = `0x${Buffer.from(derived).toString("hex")}`;
      if (derivedAddress !== normalizeAddress("aptos", input.address)) {
        throw new Error("Public key does not match the Aptos address");
      }
      const signature = hexToBytes(stripHex(input.signature));
      return ed.verify(signature, utf8(input.fullMessage), publicKey);
    }
  }
};
