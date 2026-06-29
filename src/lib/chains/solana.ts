import { getChain } from "./registry";

/**
 * Solana cluster helpers. Reads come from `@solana/web3.js` `Connection`.
 * Program IDs are placeholders — wire to deployed programs once written.
 */

export interface SolanaCluster {
  chainId: string;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  programId: string | null;
  testnet: boolean;
}

export const getSolanaClusters = (): SolanaCluster[] => {
  return ["solana:mainnet", "solana:devnet"]
    .map((id) => getChain(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => ({
      chainId: c.id,
      name: c.name,
      rpcUrl: c.rpcUrl,
      explorerUrl: c.explorerUrl,
      programId: c.programId,
      testnet: c.testnet,
    }));
};