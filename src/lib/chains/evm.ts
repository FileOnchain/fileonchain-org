import type { Chain } from "viem";
import { mainnet, base, optimism, arbitrum, polygon } from "viem/chains";
import { getChain } from "./registry";
import type { ChainConfig } from "./registry";

/**
 * Map a ChainConfig to a viem `Chain` for use with `createPublicClient` /
 * `createWalletClient`. Only EVM chains are mapped.
 */
export const chainConfigToViem = (config: ChainConfig): Chain | null => {
  switch (config.id) {
    case "evm:1":
      return mainnet;
    case "evm:8453":
      return base;
    case "evm:10":
      return optimism;
    case "evm:42161":
      return arbitrum;
    case "evm:137":
      return polygon;
    default:
      return null;
  }
};

/**
 * Look up a viem Chain by our ChainId. Returns null if the chain is not EVM.
 */
export const getViemChain = (chainId: string) => {
  const cfg = getChain(chainId);
  if (!cfg) return null;
  return chainConfigToViem(cfg);
};