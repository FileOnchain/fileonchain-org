import "server-only";
import { PublicKey } from "@hashgraph/sdk";
import { proto } from "@hiero-ledger/proto";
import { hexToBytes } from "@noble/hashes/utils.js";
import type { WalletVerificationInput } from "../verify-wallet";

/**
 * Hedera signature verification for HIP-820 `hedera_signMessage`.
 *
 * The wallet produces a SignatureMap protobuf (base64-encoded) carrying one
 * or more `SignaturePair` entries. Each pair has either an `ed25519` byte
 * buffer or an `ECDSASecp256k1` byte buffer — the algorithm is a property
 * of the account key, not the signature.
 *
 * The wallet signs the envelope:
 *   `"\x19Hedera Signed Message:\n" ‖ utf8(message.length) ‖ utf8(message)`
 *
 * The public key is **not** recovered from the signature. The verifier must
 * independently confirm that the claimed public key corresponds to the
 * claimed Hedera account by fetching the authoritative key from the mirror
 * node (no auth, public consensus-replicated data). This binds the proof to
 * the address — without it, an attacker could sign with any keypair and
 * claim any account id.
 *
 * Hedera account ids are deterministic from the ed25519 public key
 * (last 8 bytes of sha384(pubkey) reinterpreted as little-endian uint64,
 * prefixed with `0.0.`), but the mirror-node lookup is the simpler and more
 * robust path — it works for both ed25519 and ECDSA accounts uniformly.
 */

const stripHex = (value: string): string =>
  value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;

const MIRROR_NODE_BY_NETWORK: Record<string, string> = {
  mainnet: "https://mainnet.mirrornode.hedera.com",
  testnet: "https://testnet.mirrornode.hedera.com",
  previewnet: "https://previewnet.mirrornode.hedera.com",
};

/** `hedera:testnet:0.0.12345` → network=testnet, accountId=`0.0.12345`. */
const splitHederaId = (
  raw: string,
): { network: string; accountId: string } | null => {
  const match = raw.match(/^(hedera:(mainnet|testnet|previewnet)):(.+)$/i);
  if (!match) return null;
  return { network: match[2].toLowerCase(), accountId: match[3] };
};

/** Build the canonical Hedera signed-bytes envelope. */
const buildEnvelope = (message: string): Uint8Array => {
  const prefix = new TextEncoder().encode("\x19Hedera Signed Message:\n");
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

interface HederaAccountInfo {
  key?: {
    _type?: "ED25519" | "ECDSA_SECP256K1" | "ProtobufEncoded";
    key?: string;
  } | null;
}

/**
 * Fetch the authoritative public key bytes for a Hedera account id from the
 * mirror node. Returns `null` on any failure — the caller surfaces a clear
 * error to the user.
 */
const fetchAccountPublicKey = async (
  address: string,
): Promise<string | null> => {
  const split = splitHederaId(address);
  if (!split) return null;
  const base = MIRROR_NODE_BY_NETWORK[split.network];
  if (!base) return null;
  const url = `${base}/api/v1/accounts/${encodeURIComponent(split.accountId)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const info = (await res.json()) as HederaAccountInfo;
  return info.key?.key ?? null;
};

export const verifyHedera = async (
  input: WalletVerificationInput,
  message: string,
): Promise<boolean> => {
  if (!input.publicKey) {
    throw new Error("Hedera verification requires the signer public key");
  }

  // Bind the public key to the address via the mirror node. Without this
  // check, an attacker can sign with any keypair and claim any account id —
  // see the security audit that motivated this verifier.
  const chainPublicKey = await fetchAccountPublicKey(input.address);
  if (!chainPublicKey) {
    throw new Error(
      `Hedera mirror node returned no key for ${input.address} — cannot bind the proof to the address.`,
    );
  }
  if (chainPublicKey.toLowerCase() !== input.publicKey.toLowerCase()) {
    throw new Error(
      "Hedera public key does not match the account on chain",
    );
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
    (pair.ECDSASecp256k1 && pair.ECDSASecp256k1.length > 0 &&
      pair.ECDSASecp256k1) ||
    null;
  if (!sigBytes) {
    throw new Error(
      "Hedera signature pair is missing both ed25519 and ECDSASecp256k1 fields",
    );
  }
  if (sigBytes.length !== 64) {
    throw new Error(
      `Hedera signature must be 64 bytes (got ${sigBytes.length})`,
    );
  }

  const publicKey = PublicKey.fromBytes(hexToBytes(stripHex(input.publicKey)));
  return publicKey.verify(buildEnvelope(message), sigBytes);
};