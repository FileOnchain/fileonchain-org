import "server-only";
import { parseAnchorPayload, type CIDRegistryRecord, type ChainConfig } from "@fileonchain/sdk";

/**
 * Direct `@polkadot/api` chain scan fallback for Substrate registry reads.
 *
 * Substrate has no native JSON-RPC method for "fetch extrinsic by hash",
 * so this fallback only kicks in when the caller supplies a `blockHint`
 * (a block hash or number). It then walks every extrinsic in that block,
 * extracts each `system.remarkWithEvent` remark, and returns the first
 * one whose parsed anchor payload carries the requested CID.
 *
 * Without `blockHint` this throws — the explorer/indexer pattern is
 * "fail loudly, never fabricate". The mirror API path
 * (`substrate-mirror.ts`) is the preferred primary; this module exists
 * as the seam for a future internal `substrate_block_index` table that
 * maps tx-hash → block-hash via a Subscan listener.
 *
 * Heavy deps (viem-equivalent for Substrate: `@polkadot/api` +
 * `HttpProvider`) are dynamic-imported so the web client bundle stays
 * out of the Substrate transport cost.
 */

interface ChainScanParams {
  chain: ChainConfig;
  cid: string;
  blockHint: string | number;
}

interface RemarkedExtrinsic {
  method: { section: string; method: string };
  args: unknown[];
  hash: { toHex: () => string };
  signature?: { signer: { toString: () => string } };
}

interface SignedBlockShape {
  block: {
    header: { number: { toNumber: () => number } };
    extrinsics: RemarkedExtrinsic[];
  };
}

const fetchBlockHash = async (
  api: unknown,
  hint: string | number,
): Promise<string> => {
  if (typeof hint === "number") {
    // `getBlockHash(height)` returns a Hash; stringify the hex form.
    const hash = await (
      api as {
        rpc: {
          chain: { getBlockHash: (h: number) => Promise<{ toHex: () => string }> };
        };
      }
    ).rpc.chain.getBlockHash(hint);
    return hash.toHex();
  }
  // Caller already supplied a block hash; nothing to resolve.
  return hint;
};

export const readSubstrateRecordViaChain = async ({
  chain,
  cid,
  blockHint,
}: ChainScanParams): Promise<CIDRegistryRecord | null> => {
  if (!chain.rpcUrl) {
    throw new Error(
      `Substrate chain ${chain.id} has no rpcUrl; direct chain scan impossible`,
    );
  }
  const { ApiPromise, HttpProvider } = await import("@polkadot/api");
  const api = (await ApiPromise.create({
    provider: new HttpProvider(chain.rpcUrl),
  })) as unknown;
  try {
    const blockHash = await fetchBlockHash(api, blockHint);
    const block = (await (
      api as {
        rpc: {
          chain: { getBlock: (h: string) => Promise<SignedBlockShape> };
        };
      }
    ).rpc.chain.getBlock(blockHash)) as SignedBlockShape;

    for (const extrinsic of block.block.extrinsics) {
      if (
        extrinsic.method.section !== "system" ||
        extrinsic.method.method !== "remarkWithEvent"
      ) {
        continue;
      }
      const remarkBytes = extrinsic.args[0] as Uint8Array | string;
      const remark =
        typeof remarkBytes === "string"
          ? remarkBytes
          : new TextDecoder().decode(remarkBytes);
      const payload = parseAnchorPayload(remark);
      if (!payload || payload.cid !== cid) continue;
      // `sha256` lives on the file-level anchor payload only; chunk
      // payloads carry the per-chunk bytes instead. We surface the
      // bytes32 hash when available and fall back to the empty hash.
      const contentHash =
        payload.op === "anchor" && payload.sha256 ? payload.sha256 : "";
      const uri = payload.op === "anchor" && payload.uri ? payload.uri : "";
      return {
        cid,
        chainId: chain.id,
        registryAddress:
          "0x0000000000000000000000000000000000000000" as `0x${string}`,
        txHash: extrinsic.hash.toHex(),
        blockNumber: block.block.header.number.toNumber(),
        timestamp: Math.floor(Date.now() / 1000),
        submitter: extrinsic.signature?.signer.toString() ?? "0x0000000000000000000000000000000000000000",
        contentHash,
        uri,
        status: "anchored",
      };
    }
    return null;
  } finally {
    await (api as { disconnect: () => Promise<void> }).disconnect();
  }
};
