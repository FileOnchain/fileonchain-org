import { describe, expect, it } from "vitest";
import { verifyCardano } from "@/lib/auth/verifiers/cardano";
import { verifyCosmos } from "@/lib/auth/verifiers/cosmos";
import { verifyHedera } from "@/lib/auth/verifiers/hedera";
import { verifyNear } from "@/lib/auth/verifiers/near";
import { verifyStarknet } from "@/lib/auth/verifiers/starknet";
import { verifySui } from "@/lib/auth/verifiers/sui";
import { verifyTon } from "@/lib/auth/verifiers/ton";
import { verifyTron } from "@/lib/auth/verifiers/tron";
import type { WalletVerificationInput } from "@/lib/auth/verify-wallet";

/** Eight per-family wallet verifiers — Tier 2 of the auth proof
 *  flow. Each verifier exposes a contract: given a malformed input,
 *  it must throw a clear, user-facing error message before reaching
 *  the signature math. A silent failure (returning false on a
 *  malformed input, or accepting a 0-byte signature) would let a
 *  bad probe through to the nonce-consume commit and effectively
 *  burn the user's nonce.
 *
 *  The tests below never reach signature verification — every
 *  input is chosen to fail the front-door validation. The error
 *  messages are part of the contract and users see them in the
 *  UI, so the assertions pin the exact strings. */

const baseInput: WalletVerificationInput = {
  family: "evm",
  address: "0x0000000000000000000000000000000000000001",
  signature: "0x00",
  nonce: "n_abc",
};

/* ------------------------------------------------------------------ */
/* TON                                                                  */
/* ------------------------------------------------------------------ */

describe("verifyTon — input validation", () => {
  const tonInput = (overrides: Partial<WalletVerificationInput> = {}): WalletVerificationInput => ({
    ...baseInput,
    family: "ton",
    address: "EQx",
    signature: "AAAA",
    nonce: "n_abc",
    timestamp: 1_700_000_000,
    domain: "fileonchain.org",
    ...overrides,
  });

  it("throws when publicKey is missing", async () => {
    await expect(
      verifyTon(tonInput(), "msg", "fileonchain.org", new Date()),
    ).rejects.toThrow("TON verification requires the signer public key");
  });

  it("throws when timestamp is missing or non-finite", async () => {
    await expect(
      verifyTon(
        tonInput({ timestamp: undefined, publicKey: "00".repeat(32) }),
        "msg",
        "fileonchain.org",
        new Date(),
      ),
    ).rejects.toThrow("TON verification requires a timestamp in the proof");
  });

  it("throws when domain is missing or empty", async () => {
    await expect(
      verifyTon(
        tonInput({ domain: undefined, publicKey: "00".repeat(32) }),
        "msg",
        "fileonchain.org",
        new Date(),
      ),
    ).rejects.toThrow("TON verification requires a domain in the proof");
  });

  it("throws when signature is not valid base64", async () => {
    await expect(
      verifyTon(
        tonInput({ publicKey: "00".repeat(32), signature: "not base64!@#" }),
        "msg",
        "fileonchain.org",
        new Date(),
      ),
    ).rejects.toThrow("TON signature is not valid base64");
  });

  it("throws when the proof's domain does not match the expected dApp domain", async () => {
    await expect(
      verifyTon(
        tonInput({ publicKey: "00".repeat(32), domain: "evil.example" }),
        "msg",
        "fileonchain.org",
        new Date(),
      ),
    ).rejects.toThrow("TON proof domain mismatch");
  });

  it("throws when the timestamp is more than 60s in the past", async () => {
    // The bound is `timestamp < issuedSeconds - 60`. Pick a nonce
    // issued ~30s ago and a timestamp 100s before *that* — the
    // wallet's clock is far behind the server's nonce mint.
    const nonceIssuedAt = new Date(Date.now() - 30 * 1000);
    const issuedSeconds = Math.floor(nonceIssuedAt.getTime() / 1000);
    await expect(
      verifyTon(
        tonInput({
          publicKey: "00".repeat(32),
          timestamp: issuedSeconds - 100,
        }),
        "msg",
        "fileonchain.org",
        nonceIssuedAt,
      ),
    ).rejects.toThrow("TON proof timestamp out of bounds");
  });
});

/* ------------------------------------------------------------------ */
/* Hedera                                                               */
/* ------------------------------------------------------------------ */

describe("verifyHedera — input validation", () => {
  const hederaInput = (
    overrides: Partial<WalletVerificationInput> = {},
  ): WalletVerificationInput => ({
    ...baseInput,
    family: "hedera",
    address: "hedera:testnet:0.0.123",
    signature: "AAAA",
    nonce: "n_abc",
    ...overrides,
  });

  it("throws when publicKey is missing", async () => {
    await expect(verifyHedera(hederaInput(), "msg")).rejects.toThrow(
      "Hedera verification requires the signer public key",
    );
  });
});

/* ------------------------------------------------------------------ */
/* NEAR                                                                 */
/* ------------------------------------------------------------------ */

describe("verifyNear — input validation", () => {
  const nearInput = (
    overrides: Partial<WalletVerificationInput> = {},
  ): WalletVerificationInput => ({
    ...baseInput,
    family: "near",
    address: "alice.near",
    signature: "AAAA",
    nonce: "n_abc",
    ...overrides,
  });

  it("throws when publicKey is missing", async () => {
    await expect(verifyNear(nearInput(), "msg")).rejects.toThrow(
      "NEAR verification requires an ed25519:",
    );
  });

  it("throws when publicKey does not start with 'ed25519:'", async () => {
    await expect(
      verifyNear(nearInput({ publicKey: "secp256k1:xxx" }), "msg"),
    ).rejects.toThrow("NEAR verification requires an ed25519:");
  });
});

/* ------------------------------------------------------------------ */
/* Sui                                                                 */
/* ------------------------------------------------------------------ */

describe("verifySui — input validation", () => {
  const suiInput = (
    overrides: Partial<WalletVerificationInput> = {},
  ): WalletVerificationInput => ({
    ...baseInput,
    family: "sui",
    address: "0xabc",
    signature: "AAAA",
    nonce: "n_abc",
    ...overrides,
  });

  it("throws when signature is not 97 bytes (flag + sig + pubkey)", async () => {
    // 3 bytes — too short.
    await expect(verifySui(suiInput({ signature: "AAAA" }), "msg")).rejects.toThrow(
      "Only ed25519 Sui signatures are supported",
    );
  });

  it("throws when the flag byte is not 0x00 (non-ed25519)", async () => {
    // 97 bytes with flag != 0x00. base64 of 97 bytes whose first byte
    // is 0x01 (multisig / zkLogin flag).
    const bytes = new Uint8Array(97);
    bytes[0] = 0x01;
    await expect(
      verifySui(
        suiInput({ signature: Buffer.from(bytes).toString("base64") }),
        "msg",
      ),
    ).rejects.toThrow("Only ed25519 Sui signatures are supported");
  });
});

/* ------------------------------------------------------------------ */
/* Cardano                                                              */
/* ------------------------------------------------------------------ */

describe("verifyCardano — input validation", () => {
  const cardanoInput = (
    overrides: Partial<WalletVerificationInput> = {},
  ): WalletVerificationInput => ({
    ...baseInput,
    family: "cardano",
    address: "stake1uabc",
    signature: "0x00",
    nonce: "n_abc",
    ...overrides,
  });

  it("throws when publicKey (COSE key) is missing", async () => {
    await expect(verifyCardano(cardanoInput(), "msg")).rejects.toThrow(
      "Cardano verification requires the COSE key",
    );
  });

  it("throws when the COSE_Sign1 signature is malformed", async () => {
    // publicKey is set but signature is "0x00" — CBOR decoder fails.
    await expect(
      verifyCardano(cardanoInput({ publicKey: "0x00" }), "msg"),
    ).rejects.toThrow("Malformed COSE_Sign1");
  });
});

/* ------------------------------------------------------------------ */
/* Cosmos                                                               */
/* ------------------------------------------------------------------ */

describe("verifyCosmos — input validation", () => {
  const cosmosInput = (
    overrides: Partial<WalletVerificationInput> = {},
  ): WalletVerificationInput => ({
    ...baseInput,
    family: "cosmos",
    address: "cosmos1abc",
    signature: "AAAA",
    nonce: "n_abc",
    ...overrides,
  });

  it("throws when publicKey is missing", () => {
    // Cosmos verifier is synchronous — return a boolean, not a Promise.
    expect(() => verifyCosmos(cosmosInput(), "msg")).toThrow(
      "Cosmos verification requires the signer public key",
    );
  });

  it("throws when publicKey is not 33 compressed secp256k1 bytes", () => {
    // 32 bytes (uncompressed / wrong size) — base64 of 32 zero bytes.
    expect(() =>
      verifyCosmos(
        cosmosInput({ publicKey: Buffer.alloc(32).toString("base64") }),
        "msg",
      ),
    ).toThrow("Cosmos public key must be 33 compressed secp256k1 bytes");
  });
});

/* ------------------------------------------------------------------ */
/* Tron                                                                 */
/* ------------------------------------------------------------------ */

describe("verifyTron — input validation", () => {
  const tronInput = (
    overrides: Partial<WalletVerificationInput> = {},
  ): WalletVerificationInput => ({
    ...baseInput,
    family: "tron",
    address: "TAbc",
    signature: "0x" + "00".repeat(65),
    nonce: "n_abc",
    ...overrides,
  });

  it("throws when signature is not 65 bytes", async () => {
    await expect(
      verifyTron(tronInput({ signature: "0x01" }), "msg"),
    ).rejects.toThrow("TRON signatures must be 65 bytes");
  });
});

/* ------------------------------------------------------------------ */
/* Starknet                                                             */
/* ------------------------------------------------------------------ */

describe("verifyStarknet — input validation", () => {
  const starknetInput = (
    overrides: Partial<WalletVerificationInput> = {},
  ): WalletVerificationInput => ({
    ...baseInput,
    family: "starknet",
    address: "0xabc",
    signature: "[]",
    nonce: "n_abc",
    ...overrides,
  });

  it("throws when signature is not valid JSON", async () => {
    await expect(
      verifyStarknet(starknetInput({ signature: "not json" }), "msg"),
    ).rejects.toThrow("Starknet signatures must be a JSON array of felts");
  });

  it("throws when the parsed JSON is not an array", async () => {
    // JSON parses to a string — the array check is the next gate,
    // so the error message names the "non-empty felt array" shape.
    await expect(
      verifyStarknet(starknetInput({ signature: '"a string"' }), "msg"),
    ).rejects.toThrow("Starknet signatures must be a non-empty felt array");
  });

  it("throws when the felt array is empty", async () => {
    await expect(
      verifyStarknet(starknetInput({ signature: "[]" }), "msg"),
    ).rejects.toThrow("Starknet signatures must be a non-empty felt array");
  });
});
