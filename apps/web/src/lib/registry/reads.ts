import {
  CHAINS,
  getChain,
  isChainProvisioned,
  type ChainId,
  type CIDRegistryRecord,
} from "@fileonchain/sdk";
import { getMockCIDRecord } from "@/lib/mock/registry";
import { readSubstrateRecordViaMirror } from "@/lib/registry/substrate-mirror";

/**
 * Registry reads — real contract / mirror reads on provisioned chains, mock
 * fallback everywhere else.
 *
 * - Provisioned EVM chains resolve through `FileRegistry` storage via the
 *   `@fileonchain/sdk/evm` read helpers (dynamic-imported so viem stays out
 *   of the client bundle until needed). A provisioned chain's answer is
 *   authoritative: "no stored record" returns null rather than falling back
 *   to fake data.
 * - Substrate chains with a configured `mirrorApiUrl` resolve through the
 *   Subscan / Autonomys explorer mirror (see `substrate-mirror.ts`).
 *   Subscan-backed asset hubs leave the field unset until `SUBSCAN_API_KEY`
 *   is provisioned, in which case the read falls back to the mock.
 * - Chains with nothing deployed (EVM unprovisioned, Substrate without a
 *   mirror) keep returning the deterministic mocks so the rest of the UI
 *   stays explorable — the same seam `useFileUploader` uses for sends.
 *
 * Contract storage only keeps the first-write record, so records read here
 * carry no txHash/blockNumber; those stay event/indexer territory
 * (see lib/mock/cid-indexer.ts).
 */

/**
 * Resolve the registry record for a CID on one chain. Real
 * `FileRegistry.getCIDRecord` read where provisioned (null until the CID is
 * anchored), mirror-API read where substrate + mirrorApiUrl is set, mock
 * elsewhere. RPC failures resolve to null — a read error must not fabricate
 * a record.
 */
export const getCIDRecord = async (
  cid: string,
  chainId: ChainId,
): Promise<CIDRegistryRecord | null> => {
  const chain = getChain(chainId);
  if (!chain) return null;

  // Substrate: prefer the chain's mirror API; chain-side scan requires a
  // block hint that we don't have at this layer, so the direct scan lives
  // in `substrate-chain.ts` for callers that know the block.
  if (chain.family === "substrate" && chain.mirrorApiUrl) {
    const record = await readSubstrateRecordViaMirror(chain, cid);
    if (record) return record;
  }

  if (chain.family === "evm" && isChainProvisioned(chain)) {
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
  }

  return getMockCIDRecord(cid, chainId);
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
