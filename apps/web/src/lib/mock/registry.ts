import { keccak256, stringToBytes } from "viem";
import {
  CHAINS,
  getRegistryAddress,
  type ChainId,
  type CIDRegistryRecord,
} from "@fileonchain/sdk";

/* Provisioned EVM chains read the real FileRegistry through
 * lib/registry/reads.ts; these mocks remain the fallback for chains with
 * nothing deployed (and the polkadot-query path still TODO).
 */

/**
 * Deterministic pseudo-random hash derived from a CID + chain id. Same input
 * always returns the same hash, so the mock indexer is reproducible.
 */
const hashKey = (cid: string, chainId: ChainId): `0x${string}` => {
  return keccak256(stringToBytes(`${cid}:${chainId}`));
};

/**
 * Compute a stable registry record for a CID on a given chain. Returns
 * `null` when the chain doesn't support EVM contract reads.
 */
export const getMockCIDRecord = (
  cid: string,
  chainId: ChainId,
): CIDRegistryRecord | null => {
  const chain = CHAINS.find((c) => c.id === chainId);
  if (!chain || chain.family !== "evm") return null;

  const seed = hashKey(cid, chainId);
  const blockNumber = 18_000_000 + Number(BigInt(seed.slice(0, 8)) % BigInt(5_000_000));
  const timestamp = Math.floor(Date.now() / 1000) - Number(BigInt(`0x${seed.slice(8, 16)}`) % BigInt(86_400 * 7));

  return {
    cid,
    chainId,
    registryAddress: getRegistryAddress(chainId),
    txHash: seed,
    blockNumber,
    timestamp,
    submitter: `0x${seed.slice(2, 42)}`,
    contentHash: keccak256(stringToBytes(`content:${cid}`)),
    uri: `ipfs://${cid}`,
    status: "anchored",
  };
};
