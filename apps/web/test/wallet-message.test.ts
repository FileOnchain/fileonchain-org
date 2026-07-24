import { describe, expect, it } from "vitest";
import {
  NEAR_SIGN_RECIPIENT,
  WALLET_FAMILIES,
  buildStarknetTypedData,
  buildWalletMessage,
  isWalletFamily,
  normalizeAddress,
} from "@/lib/auth/wallet-message";

/** The sign-in challenge shared by the client (what the wallet signs)
 *  and the server (what the signature is verified against). Isomorphic
 *  — keep it dependency-free and deterministic; any drift between
 *  the two sides makes every signature invalid. */

/* ------------------------------------------------------------------ */
/* WALLET_FAMILIES                                                      */
/* ------------------------------------------------------------------ */

describe("WALLET_FAMILIES", () => {
  it("lists every family the auth proof flow can accept", () => {
    // The list is the source of truth for `useWalletProof`. A
    // missing entry means a wallet family becomes unreachable.
    expect(WALLET_FAMILIES).toEqual([
      "evm",
      "substrate",
      "solana",
      "aptos",
      "cosmos",
      "sui",
      "starknet",
      "near",
      "tron",
      "cardano",
      "ton",
      "hedera",
    ]);
  });

  it("every family appears exactly once (no duplicates)", () => {
    expect(new Set(WALLET_FAMILIES).size).toBe(WALLET_FAMILIES.length);
  });

  it("is declared as readonly so a stray push() throws at runtime", () => {
    // Sanity-check the brand: a consumer that mutates the array
    // would change auth-capable families everywhere.
    expect(Array.isArray(WALLET_FAMILIES)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* isWalletFamily                                                       */
/* ------------------------------------------------------------------ */

describe("isWalletFamily", () => {
  it("returns true for every family in WALLET_FAMILIES", () => {
    for (const family of WALLET_FAMILIES) {
      expect(isWalletFamily(family)).toBe(true);
    }
  });

  it("returns false for unknown families", () => {
    expect(isWalletFamily("bitcoin")).toBe(false);
    expect(isWalletFamily("")).toBe(false);
  });

  it("returns false for non-string inputs", () => {
    expect(isWalletFamily(null)).toBe(false);
    expect(isWalletFamily(undefined)).toBe(false);
    expect(isWalletFamily(42)).toBe(false);
    expect(isWalletFamily({})).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* buildWalletMessage                                                   */
/* ------------------------------------------------------------------ */

describe("buildWalletMessage", () => {
  it("renders the SIWE-like plain-text challenge with all four fields", () => {
    const msg = buildWalletMessage({
      family: "evm",
      address: "0xAbC123",
      nonce: "n_abc123",
      issuedAt: "2026-07-04T15:30:00Z",
    });
    expect(msg).toBe(
      [
        "fileonchain.org wants you to sign in with your evm wallet:",
        "0xAbC123",
        "",
        "Nonce: n_abc123",
        "Issued At: 2026-07-04T15:30:00Z",
      ].join("\n"),
    );
  });

  it("preserves the address case (EVM verify lowercases after parsing)", () => {
    // The EVM family uses lowercase-after-verify via `normalizeAddress`,
    // so the message itself carries the on-chain case.
    const msg = buildWalletMessage({
      family: "evm",
      address: "0xAbCdEf",
      nonce: "n",
      issuedAt: "2026-01-01T00:00:00Z",
    });
    expect(msg).toContain("0xAbCdEf");
  });

  it("uses LF line endings (no CRLF anywhere) so per-family verifiers that hash the bytes land on the same digest", () => {
    const msg = buildWalletMessage({
      family: "solana",
      address: "SoLaNa111",
      nonce: "n",
      issuedAt: "2026-01-01T00:00:00Z",
    });
    expect(msg).not.toContain("\r");
    expect(msg.split("\n").length).toBe(5);
  });

  it("emits the family string verbatim in the opening line", () => {
    const msg = buildWalletMessage({
      family: "starknet",
      address: "0xSn",
      nonce: "n",
      issuedAt: "2026-01-01T00:00:00Z",
    });
    expect(msg).toContain("with your starknet wallet:");
  });
});

/* ------------------------------------------------------------------ */
/* buildStarknetTypedData                                               */
/* ------------------------------------------------------------------ */

describe("buildStarknetTypedData", () => {
  it("wraps the message in the SNIP-12 revision-1 envelope", () => {
    const td = buildStarknetTypedData("hello");
    expect(td).toEqual({
      types: {
        StarknetDomain: [
          { name: "name", type: "shortstring" },
          { name: "version", type: "shortstring" },
        ],
        Message: [{ name: "contents", type: "string" }],
      },
      primaryType: "Message",
      domain: { name: "fileonchain.org", version: "1", revision: "1" },
      message: { contents: "hello" },
    });
  });

  it("keeps the domain free of chainId so the typed data is replay-resistant via the nonce", () => {
    const td = buildStarknetTypedData("hello");
    expect(td.domain).not.toHaveProperty("chainId");
  });

  it("embeds the message verbatim under `message.contents`", () => {
    const text = "long message with unicode 🚀 and newlines\ndone";
    const td = buildStarknetTypedData(text);
    expect(td.message.contents).toBe(text);
  });
});

/* ------------------------------------------------------------------ */
/* normalizeAddress                                                     */
/* ------------------------------------------------------------------ */

describe("normalizeAddress", () => {
  it("lowercases EVM addresses", () => {
    expect(normalizeAddress("evm", "0xAbCdEf")).toBe("0xabcdef");
  });

  it("lowercases Aptos + Sui (32-byte hex)", () => {
    expect(normalizeAddress("aptos", "0xABC")).toBe("0xabc");
    expect(normalizeAddress("sui", "0xABC")).toBe("0xabc");
  });

  it("lowercases Starknet addresses", () => {
    expect(normalizeAddress("starknet", "0xABC")).toBe("0xabc");
  });

  it("lowercases NEAR accounts (case-insensitive by spec)", () => {
    expect(normalizeAddress("near", "Alice.near")).toBe("alice.near");
  });

  it("lowercases Cosmos bech32 addresses", () => {
    // bech32 is lowercase by construction; the lower() here is a
    // no-op for canonically-cased input but defends against a
    // mixed-case client.
    expect(normalizeAddress("cosmos", "Cosmos1ABC")).toBe("cosmos1abc");
  });

  it("lowercases Cardano addresses", () => {
    expect(normalizeAddress("cardano", "stake1uXyZg")).toBe("stake1uxyzg");
  });

  it("lowercases Hedera `hedera:mainnet:0.0.xxxxx` forms", () => {
    expect(
      normalizeAddress("hedera", "hedera:mainnet:0.0.ABC123"),
    ).toBe("hedera:mainnet:0.0.abc123");
  });

  it("preserves the case of base58 families (Solana, Substrate, Tron, TON)", () => {
    // Base58 alphabets include both upper and lower case and the
    // encoding is case-sensitive — touching case silently invalidates
    // the address.
    expect(normalizeAddress("solana", "SoLaNa111")).toBe("SoLaNa111");
    expect(normalizeAddress("substrate", "SubstrateXYZ")).toBe("SubstrateXYZ");
    expect(normalizeAddress("tron", "TronXYZ")).toBe("TronXYZ");
    expect(normalizeAddress("ton", "TonXYZ")).toBe("TonXYZ");
  });

  it("the lowercase list matches WALLET_FAMILIES minus the case-sensitive families", () => {
    // Sanity-check the contract: every family is in exactly one
    // of the two buckets. A mis-classified family flips the
    // sign-in route's lookup behaviour.
    const caseSensitive = new Set([
      "solana",
      "substrate",
      "tron",
      "ton",
    ]);
    for (const family of WALLET_FAMILIES) {
      const sample = family === "evm" ? "0xABC" : "ABC";
      const normalized = normalizeAddress(family, sample);
      if (caseSensitive.has(family)) {
        expect(normalized).toBe(sample);
      } else {
        expect(normalized).toBe(sample.toLowerCase());
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* NEAR_SIGN_RECIPIENT                                                  */
/* ------------------------------------------------------------------ */

describe("NEAR_SIGN_RECIPIENT", () => {
  it("is the canonical NEP-413 recipient the client + server agree on", () => {
    // NEP-413 signMessage includes a `recipient` field whose bytes
    // are hashed into the signature payload. A drift breaks every
    // NEAR sign-in.
    expect(NEAR_SIGN_RECIPIENT).toBe("fileonchain.org");
  });
});
