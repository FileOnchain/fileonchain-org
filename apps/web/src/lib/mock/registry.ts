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
    // EVM registries run the propose/verify protocol; mock records read as
    // already finalized ("first verified wins").
    status: "verified",
  };
};

/** Mock view of a registry proposal for a CID (propose/verify protocol). */
export interface MockProposal {
  proposalId: string;
  cid: string;
  chainId: ChainId;
  status: "proposed" | "challenged" | "verified" | "rejected";
  proposer: string;
  platformId: string;
  /** FOCAT base units, stringified. */
  tip: string;
  bond: string;
  /** Unix seconds when the challenge window closes. */
  challengeDeadline: number;
  verifiedAt: number;
}

/* EVM FileRegistry reads are wired (lib/registry/reads.ts); TODO: the
 * anchor_registry views on Aptos/Sui/Starknet/NEAR once those deploy. */
export const getMockProposal = (cid: string, chainId: ChainId): MockProposal | null => {
  const chain = CHAINS.find((c) => c.id === chainId);
  if (!chain) return null;
  const protocolFamilies = ["evm", "aptos", "sui", "starknet", "near"];
  if (!protocolFamilies.includes(chain.family)) return null;

  const seed = hashKey(cid, chainId);
  const proposalId = String(1 + Number(BigInt(seed.slice(0, 10)) % 9_999n));
  const now = Math.floor(Date.now() / 1000);
  // Testnets sit inside their challenge window; mainnets are finalized.
  const verified = !chain.testnet;
  return {
    proposalId,
    cid,
    chainId,
    status: verified ? "verified" : "proposed",
    proposer: `0x${seed.slice(2, 42)}`,
    platformId: "1",
    tip: "1000000000000000000", // 1 FOCAT
    bond: "100000000000000000000", // 100 FOCAT
    challengeDeadline: verified ? now - 3_600 : now + 86_400,
    verifiedAt: verified ? now - 3_600 : 0,
  };
};
