import type { ChainFamily } from "@fileonchain/sdk";

/**
 * Sign-in challenge message shared by the client (what the wallet signs) and
 * the server (what the signature is verified against). Isomorphic — keep it
 * dependency-free and deterministic; any drift between the two sides makes
 * every signature invalid.
 */

export interface WalletChallenge {
  family: ChainFamily;
  address: string;
  nonce: string;
  /** ISO-8601 timestamp issued by the nonce endpoint. */
  issuedAt: string;
}

/**
 * Families whose wallets can sign in / link today — a browser proof flow
 * exists client-side AND the server can verify it soundly. TON (needs a
 * TON Connect manifest + proof of wallet stateInit) and Hedera (needs a
 * HashConnect pairing flow) anchor fine but stay out of auth until that
 * infrastructure lands.
 */
export const WALLET_FAMILIES: readonly ChainFamily[] = [
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
];

export const isWalletFamily = (value: unknown): value is ChainFamily =>
  typeof value === "string" && (WALLET_FAMILIES as string[]).includes(value);

/**
 * SIWE-like plain-text challenge. Simple on purpose: one format across all
 * four families so per-family code only differs in how bytes get signed.
 */
export const buildWalletMessage = ({
  family,
  address,
  nonce,
  issuedAt,
}: WalletChallenge): string =>
  [
    `fileonchain.org wants you to sign in with your ${family} wallet:`,
    address,
    "",
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");

/** Families whose addresses are case-insensitive hex (or bech32, which is
 * lowercase by construction) — canonicalized to lowercase for storage and
 * lookups. Base58 families (solana, substrate, tron, ton) and Hedera's
 * numeric ids are case-sensitive or already canonical → kept as-is. */
const LOWERCASE_FAMILIES: readonly ChainFamily[] = [
  "evm",
  "aptos",
  "sui",
  "starknet",
  "near",
  "cosmos",
  "cardano",
];

/** Canonical address form used for storage and lookups. */
export const normalizeAddress = (family: ChainFamily, address: string): string =>
  LOWERCASE_FAMILIES.includes(family) ? address.toLowerCase() : address;
