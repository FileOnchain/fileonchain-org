import "server-only";
import { PublicKey } from "@hashgraph/sdk";
import { proto } from "@hiero-ledger/proto";
import { hexToBytes } from "@noble/hashes/utils.js";
import type { WalletVerificationInput } from "../verify-wallet";

/**
 * Hedera signature verification for HIP-820 `hedera_signMessage`.
 *
 * The wallet produces a SignatureMap protobuf (base64-encoded) containing
 * one or more `SignaturePair` entries. Each pair has either an `ed25519`
 * byte buffer or an `ECDSASecp256k1` byte buffer — the algorithm is a
 * property of the account key, not the signature.
 *
 * The wallet signs the envelope:
 *   `"\x19Hedera Signed Message:\n" ‖ utf8(message.length) ‖ utf8(message)`
 *
 * The public key is carried through the proof payload (fetched from the
 * Hedera mirror node on the client at connect time). Verification is
 * deterministic — no second HTTP call.
 */

const stripHex = (value: string): string =>
  value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;

/** Build the canonical Hedera signed-bytes envelope. */
const buildEnvelope = (message: string): Uint8Array => {
  const prefix = new TextEncoder().encode("\x19Hedera Signed Message:\n");
  // HIP-820 length byte is the utf-8 byte length of the message.
  const messageBytes = new TextEncoder().encode(message);
  if (messageBytes.length > 0xff) {
    throw new Error("Hedera signed messages must be <= 255 bytes");
  }
  const lengthByte = Uint8Array.from([messageBytes.length]);
  const out = new Uint8Array(prefix.length + 1 + messageBytes.length);
  out.set(prefix, 0);
  out.set(lengthByte, prefix.length);
  out.set(messageBytes, prefix.length + 1);
  return out;
};

export const verifyHedera = async (
  input: WalletVerificationInput,
  message: string,
): Promise<boolean> => {
  if (!input.publicKey) {
    throw new Error("Hedera verification requires the signer public key");
  }

  const sigMapBytes = Buffer.from(input.signature, "base64");
  const sigMap = proto.SignatureMap.decode(sigMapBytes);
  const pairs = sigMap.sigPair ?? [];
  if (pairs.length === 0) {
    throw new Error("Hedera signature map contains no signature pairs");
  }
  // The wallet always signs for one account; pick the first pair.
  const pair = pairs[0];

  // The SignaturePair shape: { ed25519?: Uint8Array; ECDSASecp256k1?: Uint8Array; … }
  // Pick whichever branch the wallet filled in.
  const sigBytes =
    (pair.ed25519 && pair.ed25519.length > 0 && pair.ed25519) ||
    (pair.ECDSASecp256k1 && pair.ECDSASecp256k1.length > 0 && pair.ECDSASecp256k1) ||
    null;
  if (!sigBytes) {
    throw new Error(
      "Hedera signature pair is missing both ed25519 and ECDSASecp256k1 fields",
    );
  }

  const publicKey = PublicKey.fromBytes(hexToBytes(stripHex(input.publicKey)));
  return publicKey.verify(buildEnvelope(message), sigBytes);
};