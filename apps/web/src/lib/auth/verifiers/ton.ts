import "server-only";
import * as ed from "@noble/ed25519";
import { sha256 } from "@noble/hashes/sha2.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import type { WalletVerificationInput } from "../verify-wallet";

/**
 * TON Connect signature verification.
 *
 * `@tonconnect/ui-react`'s `signData({ type: "text", text })` returns a
 * payload whose digest is reconstructed server-side as:
 *
 *   sha256(
 *     workchain_byte        // 1 byte — workchain from "-1:abcdef…" address
 *   ‖ address_32            // 32 bytes — hex after the workchain colon
 *   ‖ domain_len_byte       // 1 byte — utf-8 byte length of the domain
 *   ‖ domain_utf8           // app domain (e.g. "fileonchain.org")
 *   ‖ timestamp_be_u64      // 8 bytes — issuedAt as big-endian u64
 *   ‖ payload_len_byte      // 1 byte — utf-8 byte length of the payload
 *   ‖ payload_utf8          // the buildWalletMessage string
 *   )
 *
 * The wallet signs this digest with its ed25519 secret. The corresponding
 * public key is exposed on `connector.wallet.account.publicKey` and carried
 * through the proof payload — ed25519 signatures don't recover the key.
 */

const stripHex = (value: string): string =>
  value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;

/** Build the canonical TON Connect signed-bytes digest. */
const buildDigest = (params: {
  workchain: number;
  addressHex: string;
  domain: string;
  timestamp: number;
  payload: string;
}): Uint8Array => {
  const workchainByte = Uint8Array.from([params.workchain & 0xff]);
  const addressBytes = hexToBytes(params.addressHex);
  const domainBuf = new TextEncoder().encode(params.domain);
  const domainLenByte = Uint8Array.from([domainBuf.length & 0xff]);
  const tsBuf = new ArrayBuffer(8);
  new DataView(tsBuf).setBigUint64(0, BigInt(params.timestamp), false);
  const timestampBytes = new Uint8Array(tsBuf);
  const payloadBuf = new TextEncoder().encode(params.payload);
  const payloadLenByte = Uint8Array.from([payloadBuf.length & 0xff]);
  const concat = new Uint8Array(
    workchainByte.length +
      addressBytes.length +
      domainLenByte.length +
      domainBuf.length +
      timestampBytes.length +
      payloadLenByte.length +
      payloadBuf.length,
  );
  let offset = 0;
  concat.set(workchainByte, offset);
  offset += workchainByte.length;
  concat.set(addressBytes, offset);
  offset += addressBytes.length;
  concat.set(domainLenByte, offset);
  offset += domainLenByte.length;
  concat.set(domainBuf, offset);
  offset += domainBuf.length;
  concat.set(timestampBytes, offset);
  offset += timestampBytes.length;
  concat.set(payloadLenByte, offset);
  offset += payloadLenByte.length;
  concat.set(payloadBuf, offset);
  return sha256(concat);
};

/** Parse a TON user-friendly address "-1:abcdef…" → workchain + raw 32-byte hex. */
const parseUserFriendly = (
  value: string,
): { workchain: number; hex: string } | null => {
  const colon = value.indexOf(":");
  if (colon < 0) return null;
  const wc = Number(value.slice(0, colon));
  const hex = stripHex(value.slice(colon + 1));
  if (!Number.isFinite(wc) || hex.length !== 64) return null;
  return { workchain: wc, hex };
};

export const verifyTon = async (
  input: WalletVerificationInput,
  message: string,
): Promise<boolean> => {
  if (!input.publicKey) {
    throw new Error("TON verification requires the signer public key");
  }
  if (typeof input.timestamp !== "number") {
    throw new Error("TON verification requires a timestamp in the proof");
  }
  if (typeof input.domain !== "string" || !input.domain) {
    throw new Error("TON verification requires a domain in the proof");
  }

  const parsed = parseUserFriendly(input.address);
  if (!parsed) {
    throw new Error("TON address must be in user-friendly form (e.g. -1:abc…)");
  }
  // Public key + signed address must bind to the same workchain + 32-byte hash.
  // (TON's `account_publickey` returns the raw 32-byte ed25519 key — the wallet
  // derives the address from it. The proof's `address` is what the user
  // signed; the workchain is encoded into the digest so a cross-workchain
  // replay is impossible.)

  const publicKey = hexToBytes(stripHex(input.publicKey));
  if (publicKey.length !== 32) {
    throw new Error("TON public key must be 32 bytes (ed25519)");
  }

  const digest = buildDigest({
    workchain: parsed.workchain,
    addressHex: parsed.hex,
    domain: input.domain,
    timestamp: input.timestamp,
    payload: message,
  });

  const signature = Buffer.from(input.signature, "base64");
  if (signature.length !== 64) {
    throw new Error("TON signature must be 64 bytes (ed25519)");
  }

  return ed.verify(signature, digest, publicKey);
};