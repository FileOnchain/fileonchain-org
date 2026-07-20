import { type ChainFamily } from "@fileonchain/sdk";

/**
 * Deterministic wallet-fake helpers — pure, isomorphic, no DB or chain
 * SDK access. Lives in `lib/mock/` because every value here is a
 * placeholder that real implementations will replace; kept outside
 * `lib/mock/profiles.ts` because that file is server-only (it pulls in
 * Drizzle + the indexer), and these helpers need to ship to the client
 * (e.g. `LinkWalletModal`'s placeholder address when no wallet is
 * connected yet).
 */

const HEX = "0123456789abcdef";
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const hashString = (value: string): number => {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
};

const charsFrom = (seed: string, alphabet: string, length: number): string => {
  let out = "";
  let h = hashString(seed);
  for (let i = 0; i < length; i++) {
    h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0;
    out += alphabet[h % alphabet.length];
  }
  return out;
};

/**
 * Deterministic companion address for a (primary address, family) pair, in
 * that family's canonical shape. Stands in for the wallet a user would
 * actually connect during a real link flow.
 */
export const mockLinkedAddress = (primary: string, family: ChainFamily): string => {
  const seed = `${primary}:${family}`;
  switch (family) {
    case "evm":
      return `0x${charsFrom(seed, HEX, 40)}`;
    case "aptos":
      return `0x${charsFrom(seed, HEX, 64)}`;
    case "substrate":
      return `5${charsFrom(seed, BASE58, 47)}`;
    case "solana":
      return charsFrom(seed, BASE58, 44);
    case "cosmos":
      return `cosmos1${charsFrom(seed, BASE58.toLowerCase(), 38)}`;
    case "sui":
    case "starknet":
      // Starknet addresses are 0x-prefixed 63-hex-char felt-encoded
      // addresses; Sui uses 0x-prefixed 64-hex-char addresses. Both
      // lengths share the same hex alphabet.
      return `0x${charsFrom(seed, HEX, family === "sui" ? 64 : 63)}`;
    case "near":
      return `${charsFrom(seed, BASE58.toLowerCase(), 8)}.near`;
    case "tron":
      return `0x${charsFrom(seed, HEX, 40)}`;
    case "cardano":
      return `addr1${charsFrom(seed, BASE58.toLowerCase(), 92)}`;
    case "ton":
      return `EQ${charsFrom(seed, BASE58, 46)}`;
    case "hedera":
      return `0.0.${Math.abs(hashString(seed)) % 1_000_000_000}`;
    default:
      return `0x${charsFrom(seed, HEX, 40)}`;
  }
};

/**
 * Guess the family of an address by its on-the-wire shape. Stands in for
 * a real registry lookup during the mock link flow.
 */
export const guessFamily = (address: string): ChainFamily => {
  if (address.startsWith("0x")) {
    if (address.length === 66) return "sui";
    if (address.length === 65) return "starknet";
    return "evm";
  }
  if (address.startsWith("cosmos1")) return "cosmos";
  if (address.endsWith(".near")) return "near";
  if (address.startsWith("EQ")) return "ton";
  if (address.startsWith("addr1")) return "cardano";
  if (address.startsWith("0.0.")) return "hedera";
  if (address.startsWith("5")) return "substrate";
  return "solana";
};