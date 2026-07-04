import { CHAINS } from "@fileonchain/sdk";
import type { ChainId } from "@fileonchain/sdk";

/**
 * Per-chain cost model. Used to surface a realistic gas estimate on the
 * upload screen so users understand that "multichain redundancy" is not
 * free — each chain charges its own transaction fees.
 *
 * Values are intentionally rough — they're relative to one another so the
 * UI can show which chains cost a lot and which cost almost nothing. They
 * reflect typical mainnet prices as of the mock seed time, with testnets
 * heavily discounted.
 */

export interface ChainCostEstimate {
  chainId: ChainId;
  chainName: string;
  shortName: string;
  nativeSymbol: string;
  feePerChunkNative: number; // ~ native token per chunk tx
  feePerChunkUsd: number;    // ~ USD per chunk tx
  /** Aggregator mark-up: the registry contract takes this % on top. */
  platformFeePct: number;
  /** Short label for the cost tier (cheap / moderate / expensive / testnet). */
  tier: "testnet" | "cheap" | "moderate" | "expensive";
}

const CHAIN_COSTS: Record<string, Omit<ChainCostEstimate, "chainName" | "shortName">> = {
  "evm:1":           { chainId: "evm:1",              nativeSymbol: "ETH",   feePerChunkNative: 0.00042, feePerChunkUsd: 1.40,  platformFeePct: 1.0, tier: "expensive" },
  "evm:8453":        { chainId: "evm:8453",           nativeSymbol: "ETH",   feePerChunkNative: 0.00004, feePerChunkUsd: 0.13,  platformFeePct: 1.0, tier: "cheap" },
  "evm:10":          { chainId: "evm:10",             nativeSymbol: "ETH",   feePerChunkNative: 0.00006, feePerChunkUsd: 0.20,  platformFeePct: 1.0, tier: "cheap" },
  "evm:42161":       { chainId: "evm:42161",          nativeSymbol: "ETH",   feePerChunkNative: 0.00003, feePerChunkUsd: 0.10,  platformFeePct: 1.0, tier: "cheap" },
  "evm:137":         { chainId: "evm:137",            nativeSymbol: "MATIC", feePerChunkNative: 0.018,   feePerChunkUsd: 0.012, platformFeePct: 1.0, tier: "cheap" },
  "substrate:autonomys-mainnet": { chainId: "substrate:autonomys-mainnet", nativeSymbol: "AI3", feePerChunkNative: 0.0014, feePerChunkUsd: 0.005, platformFeePct: 0.5, tier: "cheap" },
  "substrate:autonomys-taurus":  { chainId: "substrate:autonomys-taurus",  nativeSymbol: "TAU", feePerChunkNative: 0.001,  feePerChunkUsd: 0.0001, platformFeePct: 0.0, tier: "testnet" },
  "substrate:polkadot-asset-hub":{ chainId: "substrate:polkadot-asset-hub",nativeSymbol: "DOT", feePerChunkNative: 0.012,  feePerChunkUsd: 0.78,  platformFeePct: 0.5, tier: "moderate" },
  "solana:mainnet":  { chainId: "solana:mainnet",     nativeSymbol: "SOL",   feePerChunkNative: 0.000005, feePerChunkUsd: 0.0009, platformFeePct: 0.5, tier: "cheap" },
  "solana:devnet":   { chainId: "solana:devnet",      nativeSymbol: "SOL",   feePerChunkNative: 0.000005, feePerChunkUsd: 0.0001, platformFeePct: 0.0, tier: "testnet" },
  "aptos:mainnet":   { chainId: "aptos:mainnet",      nativeSymbol: "APT",   feePerChunkNative: 0.0002,  feePerChunkUsd: 0.0014, platformFeePct: 1.0, tier: "cheap" },
  "aptos:testnet":   { chainId: "aptos:testnet",      nativeSymbol: "APT",   feePerChunkNative: 0.0002,  feePerChunkUsd: 0.0001, platformFeePct: 0.0, tier: "testnet" },
  "evm:56": { chainId: "evm:56", nativeSymbol: "BNB", feePerChunkNative: 0.00035, feePerChunkUsd: 0.21, platformFeePct: 1.0, tier: "cheap" },
  "evm:97": { chainId: "evm:97", nativeSymbol: "tBNB", feePerChunkNative: 0.0003, feePerChunkUsd: 0.0001, platformFeePct: 0.0, tier: "testnet" },
  "evm:43114": { chainId: "evm:43114", nativeSymbol: "AVAX", feePerChunkNative: 0.0009, feePerChunkUsd: 0.032, platformFeePct: 1.0, tier: "cheap" },
  "evm:43113": { chainId: "evm:43113", nativeSymbol: "AVAX", feePerChunkNative: 0.0009, feePerChunkUsd: 0.0001, platformFeePct: 0.0, tier: "testnet" },
  "evm:324": { chainId: "evm:324", nativeSymbol: "ETH", feePerChunkNative: 5e-05, feePerChunkUsd: 0.16, platformFeePct: 1.0, tier: "cheap" },
  "evm:300": { chainId: "evm:300", nativeSymbol: "ETH", feePerChunkNative: 5e-05, feePerChunkUsd: 0.0001, platformFeePct: 0.0, tier: "testnet" },
  "evm:534352": { chainId: "evm:534352", nativeSymbol: "ETH", feePerChunkNative: 4e-05, feePerChunkUsd: 0.14, platformFeePct: 1.0, tier: "cheap" },
  "evm:534351": { chainId: "evm:534351", nativeSymbol: "ETH", feePerChunkNative: 4e-05, feePerChunkUsd: 0.0001, platformFeePct: 0.0, tier: "testnet" },
  "evm:59144": { chainId: "evm:59144", nativeSymbol: "ETH", feePerChunkNative: 5e-05, feePerChunkUsd: 0.17, platformFeePct: 1.0, tier: "cheap" },
  "evm:59141": { chainId: "evm:59141", nativeSymbol: "ETH", feePerChunkNative: 5e-05, feePerChunkUsd: 0.0001, platformFeePct: 0.0, tier: "testnet" },
  "evm:5000": { chainId: "evm:5000", nativeSymbol: "MNT", feePerChunkNative: 0.02, feePerChunkUsd: 0.016, platformFeePct: 1.0, tier: "cheap" },
  "evm:5003": { chainId: "evm:5003", nativeSymbol: "MNT", feePerChunkNative: 0.02, feePerChunkUsd: 0.0001, platformFeePct: 0.0, tier: "testnet" },
  "evm:81457": { chainId: "evm:81457", nativeSymbol: "ETH", feePerChunkNative: 5e-05, feePerChunkUsd: 0.17, platformFeePct: 1.0, tier: "cheap" },
  "evm:168587": { chainId: "evm:168587", nativeSymbol: "ETH", feePerChunkNative: 5e-05, feePerChunkUsd: 0.0001, platformFeePct: 0.0, tier: "testnet" },
  "evm:42220": { chainId: "evm:42220", nativeSymbol: "CELO", feePerChunkNative: 0.001, feePerChunkUsd: 0.0006, platformFeePct: 1.0, tier: "cheap" },
  "evm:44787": { chainId: "evm:44787", nativeSymbol: "CELO", feePerChunkNative: 0.001, feePerChunkUsd: 0.0001, platformFeePct: 0.0, tier: "testnet" },
  "evm:11155111": { chainId: "evm:11155111", nativeSymbol: "ETH", feePerChunkNative: 0.0004, feePerChunkUsd: 0.0001, platformFeePct: 0.0, tier: "testnet" },
  "evm:84532": { chainId: "evm:84532", nativeSymbol: "ETH", feePerChunkNative: 4e-05, feePerChunkUsd: 0.0001, platformFeePct: 0.0, tier: "testnet" },
  "evm:11155420": { chainId: "evm:11155420", nativeSymbol: "ETH", feePerChunkNative: 6e-05, feePerChunkUsd: 0.0001, platformFeePct: 0.0, tier: "testnet" },
  "evm:421614": { chainId: "evm:421614", nativeSymbol: "ETH", feePerChunkNative: 3e-05, feePerChunkUsd: 0.0001, platformFeePct: 0.0, tier: "testnet" },
  "evm:80002": { chainId: "evm:80002", nativeSymbol: "POL", feePerChunkNative: 0.018, feePerChunkUsd: 0.0001, platformFeePct: 0.0, tier: "testnet" },
  "substrate:kusama-asset-hub": { chainId: "substrate:kusama-asset-hub", nativeSymbol: "KSM", feePerChunkNative: 0.003, feePerChunkUsd: 0.09, platformFeePct: 0.5, tier: "cheap" },
  "substrate:westend-asset-hub": { chainId: "substrate:westend-asset-hub", nativeSymbol: "WND", feePerChunkNative: 0.003, feePerChunkUsd: 0.0001, platformFeePct: 0.0, tier: "testnet" },
  "substrate:paseo-asset-hub": { chainId: "substrate:paseo-asset-hub", nativeSymbol: "PAS", feePerChunkNative: 0.012, feePerChunkUsd: 0.0001, platformFeePct: 0.0, tier: "testnet" },
  "cosmos:cosmoshub-4": { chainId: "cosmos:cosmoshub-4", nativeSymbol: "ATOM", feePerChunkNative: 0.002, feePerChunkUsd: 0.014, platformFeePct: 0.5, tier: "cheap" },
  "cosmos:theta-testnet-001": { chainId: "cosmos:theta-testnet-001", nativeSymbol: "ATOM", feePerChunkNative: 0.002, feePerChunkUsd: 0.0001, platformFeePct: 0.0, tier: "testnet" },
  "sui:mainnet": { chainId: "sui:mainnet", nativeSymbol: "SUI", feePerChunkNative: 0.002, feePerChunkUsd: 0.007, platformFeePct: 0.5, tier: "cheap" },
  "sui:testnet": { chainId: "sui:testnet", nativeSymbol: "SUI", feePerChunkNative: 0.002, feePerChunkUsd: 0.0001, platformFeePct: 0.0, tier: "testnet" },
  "starknet:mainnet": { chainId: "starknet:mainnet", nativeSymbol: "STRK", feePerChunkNative: 0.02, feePerChunkUsd: 0.011, platformFeePct: 1.0, tier: "cheap" },
  "starknet:sepolia": { chainId: "starknet:sepolia", nativeSymbol: "STRK", feePerChunkNative: 0.02, feePerChunkUsd: 0.0001, platformFeePct: 0.0, tier: "testnet" },
  "near:mainnet": { chainId: "near:mainnet", nativeSymbol: "NEAR", feePerChunkNative: 0.0008, feePerChunkUsd: 0.0025, platformFeePct: 0.5, tier: "cheap" },
  "near:testnet": { chainId: "near:testnet", nativeSymbol: "NEAR", feePerChunkNative: 0.0008, feePerChunkUsd: 0.0001, platformFeePct: 0.0, tier: "testnet" },
  "tron:mainnet": { chainId: "tron:mainnet", nativeSymbol: "TRX", feePerChunkNative: 1.1, feePerChunkUsd: 0.3, platformFeePct: 1.0, tier: "moderate" },
  "tron:nile": { chainId: "tron:nile", nativeSymbol: "TRX", feePerChunkNative: 1.1, feePerChunkUsd: 0.0001, platformFeePct: 0.0, tier: "testnet" },
  "cardano:mainnet": { chainId: "cardano:mainnet", nativeSymbol: "ADA", feePerChunkNative: 0.19, feePerChunkUsd: 0.11, platformFeePct: 0.5, tier: "cheap" },
  "cardano:preprod": { chainId: "cardano:preprod", nativeSymbol: "ADA", feePerChunkNative: 0.19, feePerChunkUsd: 0.0001, platformFeePct: 0.0, tier: "testnet" },
  "ton:mainnet": { chainId: "ton:mainnet", nativeSymbol: "TON", feePerChunkNative: 0.004, feePerChunkUsd: 0.022, platformFeePct: 0.5, tier: "cheap" },
  "ton:testnet": { chainId: "ton:testnet", nativeSymbol: "TON", feePerChunkNative: 0.004, feePerChunkUsd: 0.0001, platformFeePct: 0.0, tier: "testnet" },
  "hedera:mainnet": { chainId: "hedera:mainnet", nativeSymbol: "HBAR", feePerChunkNative: 0.0008, feePerChunkUsd: 0.0001, platformFeePct: 0.5, tier: "cheap" },
  "hedera:testnet": { chainId: "hedera:testnet", nativeSymbol: "HBAR", feePerChunkNative: 0.0008, feePerChunkUsd: 0.0001, platformFeePct: 0.0, tier: "testnet" },
};

/** Return a cost estimate for every supported chain. */
export const getChainCostEstimates = (): ChainCostEstimate[] =>
  CHAINS.map((chain) => {
    const c = CHAIN_COSTS[chain.id];
    if (!c) {
      // Fallback for any chain we forgot to seed.
      return {
        chainId: chain.id,
        chainName: chain.name,
        shortName: chain.shortName,
        nativeSymbol: chain.nativeCurrency.symbol,
        feePerChunkNative: 0.001,
        feePerChunkUsd: 0.01,
        platformFeePct: 0.5,
        tier: "moderate" as const,
      };
    }
    return {
      ...c,
      chainName: chain.name,
      shortName: chain.shortName,
    };
  });

/**
 * Cost for anchoring a single chunk on the given chain, including the
 * platform's platform-fee percentage. Returned in both native and USD.
 */
export const perChunkCost = (est: ChainCostEstimate) => {
  const platformFee = est.feePerChunkUsd * (est.platformFeePct / 100);
  return {
    usd: est.feePerChunkUsd + platformFee,
    native: est.feePerChunkNative * (1 + est.platformFeePct / 100),
  };
};

/** Total cost for a file with `chunkCount` chunks on `est`. */
export const totalCostFor = (est: ChainCostEstimate, chunkCount: number) => {
  const one = perChunkCost(est);
  return {
    usd: one.usd * chunkCount,
    native: one.native * chunkCount,
  };
};

/** Compact USD formatter used by the cost estimate panel. */
export const formatCostUsd = (usd: number): string => {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  if (usd < 100) return `$${usd.toFixed(2)}`;
  return `$${Math.round(usd).toLocaleString()}`;
};
