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

export const WALLET_FAMILIES: readonly ChainFamily[] = [
  "evm",
  "substrate",
  "solana",
  "aptos",
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

/**
 * Canonical address form used for storage and lookups. EVM and Aptos hex
 * addresses are case-insensitive → lowercase; base58 (solana) and SS58
 * (substrate) are case-sensitive → kept as-is.
 */
export const normalizeAddress = (family: ChainFamily, address: string): string =>
  family === "evm" || family === "aptos" ? address.toLowerCase() : address;
