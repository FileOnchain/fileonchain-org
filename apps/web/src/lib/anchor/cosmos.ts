import type { OfflineSigner } from "@cosmjs/proto-signing";
import type { ChunkedAnchorReceipt } from "@fileonchain/sdk";
import { useWalletStates } from "@/states/wallet";
import type { AnchorRequest } from "./types";

/**
 * Cosmos sender — anchors ride the transaction memo of minimal self-sends
 * through Keplr / Leap. No module deployment is needed; chains provision by
 * flipping `memoAnchoring` in the registry.
 */
export const sendCosmosAnchor = async ({
  chain,
  fileCid,
  chunks,
  includeData,
  uri,
  onProgress,
}: AnchorRequest): Promise<ChunkedAnchorReceipt> => {
  const { cosmosAddress } = useWalletStates.getState();
  const provider =
    typeof window === "undefined" ? null : (window.keplr ?? window.leap ?? null);
  if (!cosmosAddress || !provider) {
    throw new Error("Connect a Cosmos wallet before anchoring");
  }

  onProgress?.({ stage: "connecting", chunksAnchored: 0, chunksTotal: chunks.length });
  const [{ SigningStargateClient, GasPrice }, { anchorChunkedFile }] = await Promise.all([
    import("@cosmjs/stargate"),
    import("@fileonchain/sdk/cosmos"),
  ]);

  const cosmosChainId = chain.id.split(":")[1];
  await provider.enable(cosmosChainId);
  const offlineSigner = provider.getOfflineSigner(cosmosChainId) as OfflineSigner;

  // Fee denom heuristic: "u" + lowercased symbol (uatom for the Hub).
  // Per-chain overrides can move into the registry later.
  const denom = "u" + chain.nativeCurrency.symbol.toLowerCase();
  const client = await SigningStargateClient.connectWithSigner(
    chain.rpcUrl,
    offlineSigner,
    { gasPrice: GasPrice.fromString(`0.025${denom}`) },
  );

  return anchorChunkedFile(
    {
      address: cosmosAddress,
      sendMemoTransaction: async (memo) => {
        const result = await client.sendTokens(
          cosmosAddress,
          cosmosAddress,
          [{ denom, amount: "1" }],
          "auto",
          memo,
        );
        if (result.code !== 0) {
          throw new Error(`Cosmos transaction failed: ${result.rawLog ?? result.code}`);
        }
        return { txHash: result.transactionHash, height: result.height };
      },
    },
    { chainId: chain.id, fileCid, chunks, includeData, uri, onProgress },
  );
};
