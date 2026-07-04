import "server-only";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { bech32 } from "bech32";
import type { WalletVerificationInput } from "../verify-wallet";

/**
 * ADR-36 verification for Keplr/Leap `signArbitrary`: the wallet signs an
 * amino StdSignDoc with empty chain id / fees whose single MsgSignData
 * carries our challenge. Requires `publicKey` (base64 compressed secp256k1)
 * because Cosmos signatures don't recover the key.
 */

/** Canonical amino JSON: keys below are already sorted, no whitespace. */
const buildSignDocJson = (signer: string, messageBase64: string): string =>
  JSON.stringify({
    account_number: "0",
    chain_id: "",
    fee: { amount: [], gas: "0" },
    memo: "",
    msgs: [
      {
        type: "sign/MsgSignData",
        value: { data: messageBase64, signer },
      },
    ],
    sequence: "0",
  });

export const verifyCosmos = (
  input: WalletVerificationInput,
  message: string,
): boolean => {
  if (!input.publicKey) {
    throw new Error("Cosmos verification requires the signer public key");
  }
  const publicKey = Uint8Array.from(Buffer.from(input.publicKey, "base64"));
  if (publicKey.length !== 33) {
    throw new Error("Cosmos public key must be 33 compressed secp256k1 bytes");
  }

  // The key must hash to the bech32 address (data part is
  // ripemd160(sha256(pubkey)) regardless of the chain's prefix).
  const decoded = bech32.decode(input.address);
  const addressBytes = Uint8Array.from(bech32.fromWords(decoded.words));
  const derived = ripemd160(sha256(publicKey));
  if (Buffer.compare(addressBytes, derived) !== 0) {
    throw new Error("Public key does not match the Cosmos address");
  }

  const messageBase64 = Buffer.from(message, "utf8").toString("base64");
  const signDoc = buildSignDocJson(input.address, messageBase64);
  const digest = sha256(new TextEncoder().encode(signDoc));
  const signature = Uint8Array.from(Buffer.from(input.signature, "base64"));
  return secp256k1.verify(signature, digest, publicKey);
};
