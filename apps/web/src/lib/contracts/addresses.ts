import type { ChainId } from "@/types/types";

/* TODO: deploy address — replace after Foundry Deploy.s.sol runs on each chain.
 * Until deployment, every entry is the zero address, and the mock registry in
 * `lib/mock/registry.ts` is used for reads.
 */

const ZERO = "0x0000000000000000000000000000000000000000" as const;

export const REGISTRY_ADDRESSES: Record<ChainId, `0x${string}` | null> = {
  "evm:1": ZERO,
  "evm:8453": ZERO,
  "evm:10": ZERO,
  "evm:42161": ZERO,
  "evm:137": ZERO,
  "substrate:autonomys-mainnet": null,
  "substrate:autonomys-taurus": null,
  "substrate:polkadot-asset-hub": null,
  "solana:mainnet": null,
  "solana:devnet": null,
  "aptos:mainnet": null,
  "aptos:testnet": null,
};

export const CACHE_ADDRESSES: Record<ChainId, `0x${string}` | null> = {
  ...REGISTRY_ADDRESSES,
};

export const DONATION_ADDRESSES: Record<ChainId, `0x${string}` | null> = {
  ...REGISTRY_ADDRESSES,
};

/* TODO: replace with real USDC addresses per chain */
export const USDC_ADDRESSES: Record<ChainId, `0x${string}` | null> = {
  ...REGISTRY_ADDRESSES,
};

/**
 * Pick the registry address for a chain, falling back to the zero address.
 */
export const getRegistryAddress = (chainId: ChainId): `0x${string}` =>
  REGISTRY_ADDRESSES[chainId] ?? ZERO;