import { CHAINS } from "@fileonchain/sdk";
import type { ChainId } from "@fileonchain/sdk";

/**
 * Per-chain anchoring cost model — the client-safe half. The seed table
 * below is a hand-maintained relative ranking ("which chains cost a lot,
 * which cost almost nothing") that every surface can render synchronously.
 * The live half lives in `lib/server/costs.ts`: per-family fee RPCs
 * (EVM `estimateGas` × gas price, substrate `paymentInfo`, Solana's
 * fee-per-signature) plus a USD price feed, exposed through
 * `GET /api/costs` and hydrated into `useCostsStates`.
 *
 * Every estimate says where it came from: `source: "seed"` is the static
 * fallback, `"live"` means the fee and/or USD figure was quoted from the
 * chain at request time. There is no platform fee — the registry contracts
 * are free event carriers; anchoring costs each chain's gas and nothing
 * else.
 */

export interface ChainCostEstimate {
  chainId: ChainId;
  chainName: string;
  shortName: string;
  nativeSymbol: string;
  feePerChunkNative: number; // ~ native token per chunk tx
  feePerChunkUsd: number;    // ~ USD per chunk tx
  /** Short label for the cost tier (cheap / moderate / expensive / testnet). */
  tier: "testnet" | "cheap" | "moderate" | "expensive";
  /** "seed" = static fallback row; "live" = quoted via RPC / price feed. */
  source: "seed" | "live";
}

type SeedCost = Pick<
  ChainCostEstimate,
  "nativeSymbol" | "feePerChunkNative" | "feePerChunkUsd" | "tier"
>;

const SEED_CHAIN_COSTS: Record<string, SeedCost> = {
  "evm:1":           { nativeSymbol: "ETH",   feePerChunkNative: 0.00042, feePerChunkUsd: 1.40,  tier: "expensive" },
  "evm:8453":        { nativeSymbol: "ETH",   feePerChunkNative: 0.00004, feePerChunkUsd: 0.13,  tier: "cheap" },
  "evm:870":         { nativeSymbol: "AI3",   feePerChunkNative: 0.0005,  feePerChunkUsd: 0.002, tier: "cheap" },
  "evm:8700":        { nativeSymbol: "tAI3",  feePerChunkNative: 0.0005,  feePerChunkUsd: 0.0001, tier: "testnet" },
  "evm:10":          { nativeSymbol: "ETH",   feePerChunkNative: 0.00006, feePerChunkUsd: 0.20,  tier: "cheap" },
  "evm:42161":       { nativeSymbol: "ETH",   feePerChunkNative: 0.00003, feePerChunkUsd: 0.10,  tier: "cheap" },
  "evm:137":         { nativeSymbol: "MATIC", feePerChunkNative: 0.018,   feePerChunkUsd: 0.012, tier: "cheap" },
  "substrate:autonomys-mainnet": { nativeSymbol: "AI3", feePerChunkNative: 0.0014, feePerChunkUsd: 0.005, tier: "cheap" },
  "substrate:autonomys-taurus":  { nativeSymbol: "TAU", feePerChunkNative: 0.001,  feePerChunkUsd: 0.0001, tier: "testnet" },
  "substrate:polkadot-asset-hub":{ nativeSymbol: "DOT", feePerChunkNative: 0.012,  feePerChunkUsd: 0.78,  tier: "moderate" },
  "solana:mainnet":  { nativeSymbol: "SOL",   feePerChunkNative: 0.000005, feePerChunkUsd: 0.0009, tier: "cheap" },
  "solana:devnet":   { nativeSymbol: "SOL",   feePerChunkNative: 0.000005, feePerChunkUsd: 0.0001, tier: "testnet" },
  "aptos:mainnet":   { nativeSymbol: "APT",   feePerChunkNative: 0.0002,  feePerChunkUsd: 0.0014, tier: "cheap" },
  "aptos:testnet":   { nativeSymbol: "APT",   feePerChunkNative: 0.0002,  feePerChunkUsd: 0.0001, tier: "testnet" },
  "evm:56": { nativeSymbol: "BNB", feePerChunkNative: 0.00035, feePerChunkUsd: 0.21, tier: "cheap" },
  "evm:97": { nativeSymbol: "tBNB", feePerChunkNative: 0.0003, feePerChunkUsd: 0.0001, tier: "testnet" },
  "evm:43114": { nativeSymbol: "AVAX", feePerChunkNative: 0.0009, feePerChunkUsd: 0.032, tier: "cheap" },
  "evm:43113": { nativeSymbol: "AVAX", feePerChunkNative: 0.0009, feePerChunkUsd: 0.0001, tier: "testnet" },
  "evm:324": { nativeSymbol: "ETH", feePerChunkNative: 5e-05, feePerChunkUsd: 0.16, tier: "cheap" },
  "evm:300": { nativeSymbol: "ETH", feePerChunkNative: 5e-05, feePerChunkUsd: 0.0001, tier: "testnet" },
  "evm:534352": { nativeSymbol: "ETH", feePerChunkNative: 4e-05, feePerChunkUsd: 0.14, tier: "cheap" },
  "evm:534351": { nativeSymbol: "ETH", feePerChunkNative: 4e-05, feePerChunkUsd: 0.0001, tier: "testnet" },
  "evm:59144": { nativeSymbol: "ETH", feePerChunkNative: 5e-05, feePerChunkUsd: 0.17, tier: "cheap" },
  "evm:59141": { nativeSymbol: "ETH", feePerChunkNative: 5e-05, feePerChunkUsd: 0.0001, tier: "testnet" },
  "evm:5000": { nativeSymbol: "MNT", feePerChunkNative: 0.02, feePerChunkUsd: 0.016, tier: "cheap" },
  "evm:5003": { nativeSymbol: "MNT", feePerChunkNative: 0.02, feePerChunkUsd: 0.0001, tier: "testnet" },
  "evm:81457": { nativeSymbol: "ETH", feePerChunkNative: 5e-05, feePerChunkUsd: 0.17, tier: "cheap" },
  "evm:168587": { nativeSymbol: "ETH", feePerChunkNative: 5e-05, feePerChunkUsd: 0.0001, tier: "testnet" },
  "evm:42220": { nativeSymbol: "CELO", feePerChunkNative: 0.001, feePerChunkUsd: 0.0006, tier: "cheap" },
  "evm:44787": { nativeSymbol: "CELO", feePerChunkNative: 0.001, feePerChunkUsd: 0.0001, tier: "testnet" },
  "evm:11155111": { nativeSymbol: "ETH", feePerChunkNative: 0.0004, feePerChunkUsd: 0.0001, tier: "testnet" },
  "evm:84532": { nativeSymbol: "ETH", feePerChunkNative: 4e-05, feePerChunkUsd: 0.0001, tier: "testnet" },
  "evm:11155420": { nativeSymbol: "ETH", feePerChunkNative: 6e-05, feePerChunkUsd: 0.0001, tier: "testnet" },
  "evm:421614": { nativeSymbol: "ETH", feePerChunkNative: 3e-05, feePerChunkUsd: 0.0001, tier: "testnet" },
  "evm:80002": { nativeSymbol: "POL", feePerChunkNative: 0.018, feePerChunkUsd: 0.0001, tier: "testnet" },
  "substrate:kusama-asset-hub": { nativeSymbol: "KSM", feePerChunkNative: 0.003, feePerChunkUsd: 0.09, tier: "cheap" },
  "substrate:westend-asset-hub": { nativeSymbol: "WND", feePerChunkNative: 0.003, feePerChunkUsd: 0.0001, tier: "testnet" },
  "substrate:paseo-asset-hub": { nativeSymbol: "PAS", feePerChunkNative: 0.012, feePerChunkUsd: 0.0001, tier: "testnet" },
  "cosmos:cosmoshub-4": { nativeSymbol: "ATOM", feePerChunkNative: 0.002, feePerChunkUsd: 0.014, tier: "cheap" },
  "cosmos:theta-testnet-001": { nativeSymbol: "ATOM", feePerChunkNative: 0.002, feePerChunkUsd: 0.0001, tier: "testnet" },
  "sui:mainnet": { nativeSymbol: "SUI", feePerChunkNative: 0.002, feePerChunkUsd: 0.007, tier: "cheap" },
  "sui:testnet": { nativeSymbol: "SUI", feePerChunkNative: 0.002, feePerChunkUsd: 0.0001, tier: "testnet" },
  "starknet:mainnet": { nativeSymbol: "STRK", feePerChunkNative: 0.02, feePerChunkUsd: 0.011, tier: "cheap" },
  "starknet:sepolia": { nativeSymbol: "STRK", feePerChunkNative: 0.02, feePerChunkUsd: 0.0001, tier: "testnet" },
  "near:mainnet": { nativeSymbol: "NEAR", feePerChunkNative: 0.0008, feePerChunkUsd: 0.0025, tier: "cheap" },
  "near:testnet": { nativeSymbol: "NEAR", feePerChunkNative: 0.0008, feePerChunkUsd: 0.0001, tier: "testnet" },
  "tron:mainnet": { nativeSymbol: "TRX", feePerChunkNative: 1.1, feePerChunkUsd: 0.3, tier: "moderate" },
  "tron:nile": { nativeSymbol: "TRX", feePerChunkNative: 1.1, feePerChunkUsd: 0.0001, tier: "testnet" },
  "cardano:mainnet": { nativeSymbol: "ADA", feePerChunkNative: 0.19, feePerChunkUsd: 0.11, tier: "cheap" },
  "cardano:preprod": { nativeSymbol: "ADA", feePerChunkNative: 0.19, feePerChunkUsd: 0.0001, tier: "testnet" },
  "ton:mainnet": { nativeSymbol: "TON", feePerChunkNative: 0.004, feePerChunkUsd: 0.022, tier: "cheap" },
  "ton:testnet": { nativeSymbol: "TON", feePerChunkNative: 0.004, feePerChunkUsd: 0.0001, tier: "testnet" },
  "hedera:mainnet": { nativeSymbol: "HBAR", feePerChunkNative: 0.0008, feePerChunkUsd: 0.0001, tier: "cheap" },
  "hedera:testnet": { nativeSymbol: "HBAR", feePerChunkNative: 0.0008, feePerChunkUsd: 0.0001, tier: "testnet" },
};

/** The static fallback estimate for every supported chain. */
export const getSeedCostEstimates = (): ChainCostEstimate[] =>
  CHAINS.map((chain) => {
    const seed = SEED_CHAIN_COSTS[chain.id] ?? {
      // Fallback for any chain the table doesn't seed yet.
      nativeSymbol: chain.nativeCurrency.symbol,
      feePerChunkNative: 0.001,
      feePerChunkUsd: chain.testnet ? 0.0001 : 0.01,
      tier: chain.testnet ? ("testnet" as const) : ("moderate" as const),
    };
    return {
      ...seed,
      chainId: chain.id,
      chainName: chain.name,
      shortName: chain.shortName,
      source: "seed" as const,
    };
  });

/** Cost for anchoring a single chunk on the given chain — gas only, the
 *  registry takes no fee. Returned in both native and USD. */
export const perChunkCost = (est: ChainCostEstimate) => ({
  usd: est.feePerChunkUsd,
  native: est.feePerChunkNative,
});

/** Total cost for a file with `chunkCount` chunks on `est` — gas only. */
export const totalCostFor = (est: ChainCostEstimate, chunkCount: number) => {
  const one = perChunkCost(est);
  return {
    usd: one.usd * chunkCount,
    native: one.native * chunkCount,
  };
};

/** Shown wherever dollar figures appear, and returned by `/api/costs` —
 *  the numbers are planning estimates, never a binding quote. */
export const COST_ESTIMATE_DISCLAIMER =
  "Estimates only, not a quote: each chain sets the actual fee at send time, " +
  "USD conversions use market prices that move constantly, and chains " +
  "without a live quote show seeded approximations.";

/** Compact USD formatter used by the cost estimate panel. */
export const formatCostUsd = (usd: number): string => {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  if (usd < 100) return `$${usd.toFixed(2)}`;
  return `$${Math.round(usd).toLocaleString()}`;
};
