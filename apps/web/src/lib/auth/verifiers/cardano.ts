import "server-only";
import * as ed from "@noble/ed25519";
import { blake2b } from "@noble/hashes/blake2.js";
import { bech32 } from "bech32";
import type { WalletVerificationInput } from "../verify-wallet";

/**
 * CIP-8 verification for CIP-30 `signData`. The wallet returns a COSE_Sign1
 * (in `signature`) and a COSE_Key (in `publicKey`), both CBOR hex. We check
 * that the ed25519 signature covers the Sig_structure around our exact
 * challenge bytes, that the COSE key hashes to the payment credential inside
 * the bech32 address, and that the protected headers bind that same address.
 * Only payment-credential base/enterprise addresses are accepted — stake-key
 * signatures don't prove spending control.
 *
 * The CBOR reader below handles the definite-length subset COSE uses;
 * anything else fails closed.
 */

type CborValue = number | bigint | Uint8Array | string | CborValue[] | CborMap | null;
type CborMap = Map<number | string, CborValue>;

class CborReader {
  private offset = 0;
  constructor(private readonly bytes: Uint8Array) {}

  read(): CborValue {
    const initial = this.take(1)[0];
    const major = initial >> 5;
    const info = initial & 0x1f;
    const length = this.readLength(info);
    switch (major) {
      case 0:
        return length;
      case 1:
        return typeof length === "bigint" ? -1n - length : -1 - length;
      case 2:
        return this.take(Number(length));
      case 3:
        return new TextDecoder().decode(this.take(Number(length)));
      case 4: {
        const items: CborValue[] = [];
        for (let i = 0; i < Number(length); i += 1) items.push(this.read());
        return items;
      }
      case 5: {
        const map: CborMap = new Map();
        for (let i = 0; i < Number(length); i += 1) {
          const key = this.read();
          if (typeof key !== "number" && typeof key !== "string" && typeof key !== "bigint") {
            throw new Error("Unsupported CBOR map key");
          }
          map.set(typeof key === "bigint" ? Number(key) : key, this.read());
        }
        return map;
      }
      case 7:
        if (info === 22) return null; // null
        throw new Error("Unsupported CBOR simple value");
      default:
        throw new Error("Unsupported CBOR major type");
    }
  }

  private readLength(info: number): number | bigint {
    if (info < 24) return info;
    if (info === 24) return this.take(1)[0];
    if (info === 25) return (this.take(1)[0] << 8) | this.take(1)[0];
    if (info === 26) {
      const b = this.take(4);
      return ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
    }
    if (info === 27) {
      let value = 0n;
      for (const byte of this.take(8)) value = (value << 8n) | BigInt(byte);
      return value;
    }
    throw new Error("Indefinite-length CBOR is not supported");
  }

  private take(count: number): Uint8Array {
    if (this.offset + count > this.bytes.length) throw new Error("Truncated CBOR");
    const slice = this.bytes.subarray(this.offset, this.offset + count);
    this.offset += count;
    return slice;
  }
}

/** CBOR-encode the COSE Sig_structure: ["Signature1", protected, aad, payload]. */
const encodeSigStructure = (protectedHeaders: Uint8Array, payload: Uint8Array): Uint8Array => {
  const text = new TextEncoder().encode("Signature1");
  const parts: number[] = [0x84]; // 4-element array
  const pushBytes = (major: number, bytes: Uint8Array) => {
    if (bytes.length < 24) parts.push((major << 5) | bytes.length);
    else if (bytes.length < 256) parts.push((major << 5) | 24, bytes.length);
    else if (bytes.length < 65536) {
      parts.push((major << 5) | 25, bytes.length >> 8, bytes.length & 0xff);
    } else throw new Error("Sig_structure component too large");
    parts.push(...bytes);
  };
  pushBytes(3, text); // tstr "Signature1"
  pushBytes(2, protectedHeaders); // bstr protected
  pushBytes(2, new Uint8Array(0)); // bstr external_aad (empty)
  pushBytes(2, payload); // bstr payload
  return Uint8Array.from(parts);
};

const hexToBytes = (hex: string): Uint8Array =>
  Uint8Array.from(Buffer.from(hex.startsWith("0x") ? hex.slice(2) : hex, "hex"));

/** Address header types whose *payment* part is a key hash (base 0/2,
 * pointer 4, enterprise 6). Reward (stake) addresses are rejected. */
const PAYMENT_KEY_TYPES = new Set([0, 2, 4, 6]);

export const verifyCardano = async (
  input: WalletVerificationInput,
  message: string,
): Promise<boolean> => {
  if (!input.publicKey) {
    throw new Error("Cardano verification requires the COSE key");
  }

  const sign1 = new CborReader(hexToBytes(input.signature)).read();
  if (!Array.isArray(sign1) || sign1.length !== 4) {
    throw new Error("Malformed COSE_Sign1");
  }
  const [protectedHeaders, , payload, signature] = sign1;
  if (
    !(protectedHeaders instanceof Uint8Array) ||
    !(payload instanceof Uint8Array) ||
    !(signature instanceof Uint8Array) ||
    signature.length !== 64
  ) {
    throw new Error("Malformed COSE_Sign1 fields");
  }

  // The signed payload must be our exact challenge (hashed payloads are
  // rejected — we can't tell what was displayed to the user).
  if (Buffer.compare(payload, new TextEncoder().encode(message)) !== 0) {
    throw new Error("Signed payload does not match the challenge");
  }

  const coseKey = new CborReader(hexToBytes(input.publicKey)).read();
  if (!(coseKey instanceof Map)) throw new Error("Malformed COSE_Key");
  const x = coseKey.get(-2);
  if (!(x instanceof Uint8Array) || x.length !== 32) {
    throw new Error("COSE_Key is missing a 32-byte ed25519 x coordinate");
  }

  // Address binding: bech32 address → payment credential must be the
  // blake2b-224 of the signing key, and the protected headers must name
  // the same address bytes.
  const decoded = bech32.decode(input.address, 1023);
  const addressBytes = Uint8Array.from(bech32.fromWords(decoded.words));
  if (!PAYMENT_KEY_TYPES.has(addressBytes[0] >> 4)) {
    throw new Error("Only payment-key Cardano addresses can sign in");
  }
  const keyHash = blake2b(x, { dkLen: 28 });
  if (Buffer.compare(addressBytes.subarray(1, 29), keyHash) !== 0) {
    throw new Error("COSE key does not match the address payment credential");
  }
  const headers = new CborReader(protectedHeaders).read();
  if (!(headers instanceof Map)) throw new Error("Malformed protected headers");
  const headerAddress = headers.get("address");
  if (!(headerAddress instanceof Uint8Array) || Buffer.compare(headerAddress, addressBytes) !== 0) {
    throw new Error("COSE protected headers do not bind the address");
  }

  return ed.verify(signature, encodeSigStructure(protectedHeaders, payload), x);
};
