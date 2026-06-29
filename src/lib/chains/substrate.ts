import { getChain } from "./registry";

/**
 * Substrate-specific helpers. Substrate RPC + signing flows are delegated to
 * `@polkadot/api` and `@polkadot/extension-dapp`. This module maps our
 * `ChainId` to Substrate RPC endpoints and explorer URLs.
 */

export interface SubstrateEndpoint {
  chainId: string;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  pallet: string;
  testnet: boolean;
}

export const getSubstrateEndpoints = (): SubstrateEndpoint[] => {
  return ["substrate:autonomys-mainnet", "substrate:autonomys-taurus", "substrate:polkadot-asset-hub"]
    .map((id) => getChain(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => ({
      chainId: c.id,
      name: c.name,
      rpcUrl: c.rpcUrl,
      explorerUrl: c.explorerUrl,
      pallet: c.palletContract ?? "system.remarkWithEvent",
      testnet: c.testnet,
    }));
};