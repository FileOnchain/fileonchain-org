import type { ApiPromise } from "@polkadot/api";
import type { ChainConfig, ChunkedAnchorReceipt } from "@fileonchain/sdk";
import { useWalletStates } from "@/states/wallet";
import type { AnchorRequest } from "./types";

/** One live connection per chain+endpoint — anchoring may target a different
 * Substrate chain than the one the wallet store connected to, and the URL is
 * part of the key so a custom RPC override takes effect mid-session. */
const apiCache = new Map<string, Promise<ApiPromise>>();

const getApi = (chain: ChainConfig): Promise<ApiPromise> => {
  const cacheKey = `${chain.id}|${chain.rpcUrl}`;
  let entry = apiCache.get(cacheKey);
  if (!entry) {
    entry = (async () => {
      const { ApiPromise, WsProvider } = await import("@polkadot/api");
      return ApiPromise.create({ provider: new WsProvider(chain.rpcUrl) });
    })();
    entry.catch(() => apiCache.delete(cacheKey));
    apiCache.set(cacheKey, entry);
  }
  return entry;
};

/**
 * Substrate sender — `utility.batchAll` of `system.remarkWithEvent` per
 * chunk, one signature per size-budgeted batch. Chunk bytes ride along only
 * on chains whose registry entry sets `embedsChunkData` (Autonomys); Asset
 * Hub anchors stay CID-only.
 */
export const sendSubstrateAnchor = async ({
  chain,
  fileCid,
  chunks,
  onProgress,
}: AnchorRequest): Promise<ChunkedAnchorReceipt> => {
  const { selectedAccount } = useWalletStates.getState();
  if (!selectedAccount) {
    throw new Error("Connect a Substrate wallet before anchoring");
  }

  onProgress?.({ stage: "connecting", chunksAnchored: 0, chunksTotal: chunks.length });
  const [api, { web3FromSource }, { anchorChunkedFile }] = await Promise.all([
    getApi(chain),
    import("@polkadot/extension-dapp"),
    import("@fileonchain/sdk/substrate"),
  ]);
  const injector = await web3FromSource(selectedAccount.meta.source);

  return anchorChunkedFile(api, {
    chainId: chain.id,
    address: selectedAccount.address,
    signer: injector.signer,
    fileCid,
    chunks,
    onProgress,
  });
};
