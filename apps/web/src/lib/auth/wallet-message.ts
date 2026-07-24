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
 * exists client-side AND the server can verify it soundly.
 *
 * - TON: `@tonconnect/ui-react` ships a `signData({ type: "text", … })` flow
 *   that returns the signature plus the wallet's ed25519 publicKey. The
 *   verifier (`verifiers/ton.ts`) reconstructs the canonical envelope digest
 *   and checks `ed.verify(sig, digest, publicKey)`.
 * - Hedera: `@reown/appkit` + `HederaAdapter` ship a `signMessage({ message,
 *   address })` flow that returns a base64 `SignatureMap` protobuf. The
 *   verifier (`verifiers/hedera.ts`) reconstructs the
 *   `"\x19Hedera Signed Message:\n" ‖ len ‖ msg` envelope, decodes the
 *   protobuf, and calls `PublicKey.verify(envelope, sigPair)`. The Hedera
 *   public key is fetched from the mirror node at connect time and carried
 *   through the proof (no server-side lookup).
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
  "ton",
  "hedera",
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
 * NEP-413 (NEAR signMessage) fields both sides must agree on. The wallet
 * standard wants a 32-byte nonce, so the issued nonce string is stretched
 * through SHA-256 — the client hands the derived bytes to the wallet and
 * the server re-derives them before verifying.
 */
export const NEAR_SIGN_RECIPIENT = "fileonchain.org";

/**
 * SNIP-12 typed data for Starknet sign-in. Signed by Argent/Braavos and
 * verified on-chain via the account's `is_valid_signature` (accounts are
 * contracts — there is no off-chain ecrecover). Revision 1 so `contents`
 * can be an arbitrary-length string; the domain carries no chainId — replay
 * across networks is already dead because nonces are single-use.
 */
export const buildStarknetTypedData = (message: string) => ({
  types: {
    StarknetDomain: [
      { name: "name", type: "shortstring" },
      { name: "version", type: "shortstring" },
    ],
    Message: [{ name: "contents", type: "string" }],
  },
  primaryType: "Message",
  domain: { name: "fileonchain.org", version: "1", revision: "1" },
  message: { contents: message },
});

/** Families whose addresses are case-insensitive hex (or bech32, which is
 * lowercase by construction) — canonicalized to lowercase for storage and
 * lookups. Hedera's `hedera:<network>:0.0.xxxxx` form has a case-insensitive
 * namespace + network segment, so it joins this list. Base58 families
 * (solana, substrate, tron, ton) are case-sensitive → kept as-is. */
const LOWERCASE_FAMILIES: readonly ChainFamily[] = [
  "evm",
  "aptos",
  "sui",
  "starknet",
  "near",
  "cosmos",
  "cardano",
  "hedera",
];

/** Canonical address form used for storage and lookups. */
export const normalizeAddress = (family: ChainFamily, address: string): string =>
  LOWERCASE_FAMILIES.includes(family) ? address.toLowerCase() : address;
