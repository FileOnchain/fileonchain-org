import "server-only";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import type { WalletVerificationInput } from "../verify-wallet";

/**
 * TIP-191 verification for TronLink `signMessageV2`: the wallet signs
 * keccak256("\x19TRON Signed Message:\n" + byteLength + message) and the
 * 65-byte r‖s‖v signature recovers the key, which must hash to the base58
 * T-address (0x41 ‖ keccak(pubkey)[12..], base58check).
 */

const TRON_MESSAGE_PREFIX = "\x19TRON Signed Message:\n";
const TRON_ADDRESS_PREFIX = 0x41;

const stripHex = (value: string): string =>
  value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;

export const verifyTron = async (
  input: WalletVerificationInput,
  message: string,
): Promise<boolean> => {
  const signature = Uint8Array.from(Buffer.from(stripHex(input.signature), "hex"));
  if (signature.length !== 65) {
    throw new Error("TRON signatures must be 65 bytes (r‖s‖v)");
  }
  const recovery = signature[64] >= 27 ? signature[64] - 27 : signature[64];
  if (recovery !== 0 && recovery !== 1) {
    throw new Error("Malformed TRON signature recovery byte");
  }

  const messageBytes = new TextEncoder().encode(message);
  const prefixBytes = new TextEncoder().encode(
    `${TRON_MESSAGE_PREFIX}${messageBytes.length}`,
  );
  const digest = keccak_256(
    Uint8Array.from([...prefixBytes, ...messageBytes]),
  );

  const publicKey = secp256k1.Signature.fromBytes(signature.subarray(0, 64), "compact")
    .addRecoveryBit(recovery)
    .recoverPublicKey(digest)
    .toBytes(false);

  // TRON address = base58check(0x41 ‖ keccak(pubkey)[12..32]).
  const addressBytes = Uint8Array.from([
    TRON_ADDRESS_PREFIX,
    ...keccak_256(publicKey.subarray(1)).subarray(12),
  ]);
  const checksum = sha256(sha256(addressBytes)).subarray(0, 4);
  const { base58Encode } = await import("@polkadot/util-crypto");
  const derived = base58Encode(Uint8Array.from([...addressBytes, ...checksum]));
  return derived === input.address;
};
