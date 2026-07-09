import type { ChunkedAnchorReceipt } from "@fileonchain/sdk";
import { useWalletStates } from "@/states/wallet";
import type { AnchorRequest } from "./types";

/**
 * TON sender — anchor payloads ride the text comments of minimal
 * self-transfers through OpenMask / MyTonWallet (`window.ton`). Full TON
 * Connect (bridge + manifest) is a follow-up; the injected-provider path
 * covers extension wallets today.
 */
export const sendTonAnchor = async ({
  chain,
  fileCid,
  chunks,
  includeData,
  uri,
  onProgress,
}: AnchorRequest): Promise<ChunkedAnchorReceipt> => {
  const { tonAddress } = useWalletStates.getState();
  const provider = typeof window === "undefined" ? null : (window.ton ?? null);
  if (!tonAddress || !provider) {
    throw new Error("Connect a TON wallet before anchoring");
  }

  onProgress?.({ stage: "connecting", chunksAnchored: 0, chunksTotal: chunks.length });
  const { anchorChunkedFile } = await import("@fileonchain/sdk/ton");

  return anchorChunkedFile(
    {
      address: tonAddress,
      sendCommentTransaction: async (comment) => {
        const result = await provider.send("ton_sendTransaction", [
          {
            to: tonAddress,
            value: "1000000" /* 0.001 TON self-transfer carries the comment */,
            dataType: "text",
            data: comment,
          },
        ]);
        if (result === false || result === null || result === undefined) {
          throw new Error("TON transaction was rejected");
        }
        // Injected providers don't reliably return the tx hash (some resolve
        // a bare boolean, others a tx descriptor). An empty hash is tolerated
        // — the explorer link falls back to the account page, and the SDK
        // receipt still records ordering.
        const txHash =
          typeof result === "string"
            ? result
            : ((result as { hash?: string })?.hash ?? "");
        return { txHash };
      },
    },
    { chainId: chain.id, fileCid, chunks, includeData, uri, onProgress },
  );
};
