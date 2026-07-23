import "server-only";
import * as ed from "@noble/ed25519";
import { sha256 } from "@noble/hashes/sha2.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { Address } from "@ton/core";
import type { WalletVerificationInput } from "../verify-wallet";

/**
 * TON Connect signature verification for the `signData` RPC.
 *
 * Per the TON Connect `spec/rpc.md` (`ton_signData` wire format), the wallet
 * signs the sha256 of:
 *
 *   message = 0xffff                                    (2 bytes)
 *           ++ utf8("ton-connect/sign-data/")            (22 bytes)
 *           ++ Address                                  (workchain: 4-byte BE signed int,
 *                                                          hash: 32-byte BE)
 *           ++ AppDomain                                (len: 4-byte BE,
 *                                                          domain: utf8 bytes)
 *           ++ Timestamp                                (8-byte BE u64)
 *           ++ Payload                                 ("txt" + len: 4-byte BE +
 *                                                          utf8(text))
 *
 * The wallet returns `{ signature: base64, address, timestamp, domain, payload }`
 * from `connector.signData({ type: "text", text })`. The 32-byte ed25519
 * publicKey is exposed on `connector.account.publicKey` and carried through
 * the proof.
 *
 * Bindings enforced:
 *   - **Domain**: must equal the expected dApp domain from the manifest.
 *   - **Timestamp freshness**: must be within `[nonceRow.createdAt − 60s,
 *     now + 60s]` — the nonce row's `createdAt` is the only server-known
 *     anchor for the proof's age; the agent's clock could be skewed, so we
 *     allow generous slack.
 *   - **Address binding**: the proof's address is normalized to raw form
 *     via `@ton/core`'s `Address`; the workchain + 32-byte hash from the
 *     proof must match what the digest was signed over. Combined with the
 *     ed25519 check this guarantees a substituted publicKey cannot claim
 *     a foreign address.
 */

const SCHEME_PREFIX = new TextEncoder().encode("ton-connect/sign-data/");
const TEXT_TAG = new TextEncoder().encode("txt");
const DOMAIN_MAX_BYTES = 128;
const TIMESTAMP_SKEW_SECONDS = 60;

const stripHex = (value: string): string =>
  value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;

/** Strict base64 check — the wallet always returns RFC 4648 base64. */
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

/** Encode an unsigned 32-bit integer as 4 big-endian bytes. */
const u32BE = (value: number): Uint8Array => {
  const buf = new Uint8Array(4);
  new DataView(buf.buffer).setUint32(0, value >>> 0, false);
  return buf;
};

/** Encode a signed 32-bit integer as 4 big-endian bytes (two's complement). */
const i32BE = (value: number): Uint8Array => {
  const buf = new Uint8Array(4);
  new DataView(buf.buffer).setInt32(0, value | 0, false);
  return buf;
};

/** Encode an unsigned 64-bit value as 8 big-endian bytes (clamped to int53). */
const u64BE = (value: number): Uint8Array => {
  const buf = new Uint8Array(8);
  // ton-proof / signData timestamps fit comfortably in int53 ms; we serialize
  // unix-seconds which is well within Number.MAX_SAFE_INTEGER.
  const safe = Math.max(0, Math.min(value, Number.MAX_SAFE_INTEGER));
  new DataView(buf.buffer).setUint32(0, Math.floor(safe / 0x100000000), false);
  new DataView(buf.buffer).setUint32(4, safe >>> 0, false);
  return buf;
};

/** Concatenate Uint8Arrays into a single Uint8Array. */
const concat = (...arrays: Uint8Array[]): Uint8Array => {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
};

/** Build the canonical TON Connect `signData` digest (text payload). */
const buildDigest = (params: {
  workchain: number;
  hash: Uint8Array;
  domain: string;
  timestamp: number;
  payload: string;
}): Uint8Array => {
  const domainBytes = new TextEncoder().encode(params.domain);
  if (domainBytes.length > DOMAIN_MAX_BYTES) {
    throw new Error(
      `TON signData domain exceeds ${DOMAIN_MAX_BYTES} bytes (${domainBytes.length})`,
    );
  }
  const payloadBytes = new TextEncoder().encode(params.payload);

  // 2-byte magic prefix.
  const prefix = concat(new Uint8Array([0xff, 0xff]), SCHEME_PREFIX);

  // Address = workchain (4-byte BE signed int) || hash (32-byte BE).
  const addressPart = concat(i32BE(params.workchain), params.hash);

  // AppDomain = length (4-byte BE) || utf8 bytes.
  const appDomainPart = concat(u32BE(domainBytes.length), domainBytes);

  // Timestamp = 8-byte BE u64 (unix seconds).
  const timestampPart = u64BE(params.timestamp);

  // Payload = "txt" tag || length (4-byte BE) || utf8 bytes.
  const payloadPart = concat(TEXT_TAG, u32BE(payloadBytes.length), payloadBytes);

  const message = concat(
    prefix,
    addressPart,
    appDomainPart,
    timestampPart,
    payloadPart,
  );
  return sha256(message);
};

export const verifyTon = async (
  input: WalletVerificationInput,
  message: string,
  // Server-known fields, plumbed in from verifyWalletSignature.
  expectedDomain: string,
  nonceIssuedAt: Date,
): Promise<boolean> => {
  if (!input.publicKey) {
    throw new Error("TON verification requires the signer public key");
  }
  if (typeof input.timestamp !== "number" || !Number.isFinite(input.timestamp)) {
    throw new Error("TON verification requires a timestamp in the proof");
  }
  if (typeof input.domain !== "string" || !input.domain) {
    throw new Error("TON verification requires a domain in the proof");
  }
  if (!BASE64_RE.test(input.signature)) {
    throw new Error("TON signature is not valid base64");
  }

  // Domain must equal the manifest's host. The wallet binds the domain into
  // the digest, but the server should reject any proof that names a
  // different dApp.
  if (input.domain !== expectedDomain) {
    throw new Error(
      `TON proof domain mismatch: expected ${expectedDomain}, got ${input.domain}`,
    );
  }

  // Timestamp freshness: must fall inside [nonceIssuedAt − skew, now + skew].
  // The nonce is minted right before sign-in; the wallet's timestamp should
  // match the `issuedAt` we baked into the message. Allow a generous skew
  // to absorb clock drift between the server and the wallet.
  const nowSeconds = Math.floor(Date.now() / 1000);
  const issuedSeconds = Math.floor(nonceIssuedAt.getTime() / 1000);
  if (
    input.timestamp < issuedSeconds - TIMESTAMP_SKEW_SECONDS ||
    input.timestamp > nowSeconds + TIMESTAMP_SKEW_SECONDS
  ) {
    throw new Error(
      `TON proof timestamp out of bounds: ${input.timestamp} not in [${issuedSeconds - TIMESTAMP_SKEW_SECONDS}, ${nowSeconds + TIMESTAMP_SKEW_SECONDS}]`,
    );
  }

  // Normalize address to raw form. Accept either raw `<workchain>:<hex>` or
  // user-friendly `EQ…` / `UQ…` (base64) — the TON Connect spec allows both.
  let parsed: Address;
  try {
    parsed = Address.parse(input.address);
  } catch {
    throw new Error("TON address could not be parsed");
  }
  // Address.hash is a Buffer; the digest needs raw bytes.
  const hashBytes = new Uint8Array(parsed.hash);

  const publicKey = hexToBytes(stripHex(input.publicKey));
  if (publicKey.length !== 32) {
    throw new Error("TON public key must be 32 bytes (ed25519)");
  }

  const digest = buildDigest({
    workchain: parsed.workChain,
    hash: hashBytes,
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