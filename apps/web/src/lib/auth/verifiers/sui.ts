import "server-only";
import * as ed from "@noble/ed25519";
import { blake2b } from "@noble/hashes/blake2.js";
import type { WalletVerificationInput } from "../verify-wallet";

/**
 * Sui personal-message verification. Wallet-standard `signPersonalMessage`
 * returns a serialized signature `flag ‖ sig64 ‖ pubkey32` over
 * blake2b-256(intent ‖ bcs(message bytes)) with the PersonalMessage intent
 * scope. Only ed25519 accounts (flag 0x00) are accepted — multisig and
 * zkLogin need their own flows.
 */

const ED25519_FLAG = 0x00;
const PERSONAL_MESSAGE_INTENT = Uint8Array.from([3, 0, 0]);

/** BCS vector<u8>: ULEB128 length prefix, then the raw bytes. */
const bcsVector = (bytes: Uint8Array): Uint8Array => {
  const prefix: number[] = [];
  let remaining = bytes.length;
  do {
    let byte = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining > 0) byte |= 0x80;
    prefix.push(byte);
  } while (remaining > 0);
  const out = new Uint8Array(prefix.length + bytes.length);
  out.set(prefix);
  out.set(bytes, prefix.length);
  return out;
};

export const verifySui = async (
  input: WalletVerificationInput,
  message: string,
): Promise<boolean> => {
  const serialized = Uint8Array.from(Buffer.from(input.signature, "base64"));
  if (serialized.length !== 97 || serialized[0] !== ED25519_FLAG) {
    throw new Error("Only ed25519 Sui signatures are supported");
  }
  const signature = serialized.subarray(1, 65);
  const publicKey = serialized.subarray(65, 97);

  // Sui address = blake2b-256(flag ‖ pubkey), lowercase 0x hex.
  const derived = blake2b(
    Uint8Array.from([ED25519_FLAG, ...publicKey]),
    { dkLen: 32 },
  );
  const derivedAddress = `0x${Buffer.from(derived).toString("hex")}`;
  if (derivedAddress !== input.address.toLowerCase()) {
    throw new Error("Public key does not match the Sui address");
  }

  const messageBytes = new TextEncoder().encode(message);
  const bcs = bcsVector(messageBytes);
  const signed = new Uint8Array(PERSONAL_MESSAGE_INTENT.length + bcs.length);
  signed.set(PERSONAL_MESSAGE_INTENT);
  signed.set(bcs, PERSONAL_MESSAGE_INTENT.length);
  const digest = blake2b(signed, { dkLen: 32 });
  return ed.verify(signature, digest, publicKey);
};
