import {
  CHAINS,
  getChain,
  isChainProvisioned,
  type ChainId,
  type CIDRegistryRecord,
} from "@fileonchain/sdk";
import { getMockCIDRecord } from "@/lib/mock/registry";

/**
 * Registry reads — real contract reads on provisioned chains, mock fallback
 * everywhere else.
 *
 * Provisioned EVM chains resolve through `FileRegistry` storage via the
 * `@fileonchain/sdk/evm` read helpers (dynamic-imported so viem stays out of
 * the client bundle until needed). A provisioned chain's answer is
 * authoritative: "no stored record" returns null rather than falling back to
 * fake data. Chains with nothing deployed keep returning the deterministic
 * mocks so the rest of the UI stays explorable — the same seam
 * `useFileUploader` uses for sends.
 *
 * Contract storage only keeps the first-write record, so records read here
 * carry no txHash/blockNumber; those stay event/indexer territory
 * (see lib/mock/cid-indexer.ts).
 */

const isRealReadable = (chainId: ChainId) => {
  const chain = getChain(chainId);
  return chain && chain.family === "evm" && isChainProvisioned(chain)
    ? chain
    : null;
};

/**
 * Resolve the registry record for a CID on one chain. Real
 * `FileRegistry.getCIDRecord` read where provisioned (null until the CID is
 * anchored), mock elsewhere. RPC failures resolve to null — a read error
 * must not fabricate a record.
 */
export const getCIDRecord = async (
  cid: string,
  chainId: ChainId,
): Promise<CIDRegistryRecord | null> => {
  const chain = isRealReadable(chainId);
  if (!chain) return getMockCIDRecord(cid, chainId);

  try {
    const { getCIDRecord: readCIDRecord } = await import("@fileonchain/sdk/evm");
    const record = await readCIDRecord(chainId, cid);
    if (!record) return null;
    return {
      cid,
      chainId,
      registryAddress: chain.registryContract as `0x${string}`,
      timestamp: Number(record.timestamp),
      submitter: record.submitter,
      contentHash: record.contentHash,
      uri: record.uri,
      status: "anchored",
    };
  } catch {
    return null;
  }
};

/**
 * Look up a CID across every EVM chain — one record per chain that resolves
 * one, for the explorer view.
 */
export const getCIDRecordsAcrossChains = async (
  cid: string,
): Promise<CIDRegistryRecord[]> => {
  const evmChainIds = CHAINS.filter((c) => c.family === "evm").map((c) => c.id);
  const records = await Promise.all(
    evmChainIds.map((chainId) => getCIDRecord(cid, chainId)),
  );
  return records.filter((r): r is CIDRegistryRecord => r !== null);
};
