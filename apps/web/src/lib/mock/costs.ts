import { CHAINS } from "@/lib/chains/registry";
import type { ChainId } from "@/types/types";

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
