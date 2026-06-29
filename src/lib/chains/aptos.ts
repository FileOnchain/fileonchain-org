import { getChain } from "./registry";

/**
 * Aptos network helpers. Reads come from `@aptos-labs/ts-sdk` `Aptos` client.
 * Module addresses are placeholders — wire to deployed modules once written.
 */

export interface AptosNetwork {
  chainId: string;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  moduleAddress: string | null;
  testnet: boolean;
}

export const getAptosNetworks = (): AptosNetwork[] => {
  return ["aptos:mainnet", "aptos:testnet"]
    .map((id) => getChain(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => ({
      chainId: c.id,
      name: c.name,
      rpcUrl: c.rpcUrl,
      explorerUrl: c.explorerUrl,
      moduleAddress: c.moduleAddress,
      testnet: c.testnet,
    }));
};