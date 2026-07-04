import type { ChunkedAnchorReceipt } from "@fileonchain/sdk";
import { useWalletStates } from "@/states/wallet";
import type { AnchorRequest } from "./types";

const toOrigin = (url: string): string | null => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

/**
 * TRON sender — memo transactions through TronLink's injected tronWeb. Each
 * anchor rides a 1 SUN self-send whose data field carries the payload.
 */
export const sendTronAnchor = async ({
  chain,
  fileCid,
  chunks,
  onProgress,
}: AnchorRequest): Promise<ChunkedAnchorReceipt> => {
  const { tronAddress } = useWalletStates.getState();
  const tronWeb =
    typeof window === "undefined"
      ? null
      : (window.tronLink?.tronWeb ?? window.tronWeb ?? null);
  if (!tronAddress || !tronWeb) {
    throw new Error("Connect a TRON wallet before anchoring");
  }

  // TronLink signs against whichever node it is connected to — there is no
  // per-transaction network parameter, so the user's wallet network must
  // match `chain` (mainnet vs Nile) or the anchor lands on the wrong chain.
  const walletOrigin = tronWeb.fullNode?.host
    ? toOrigin(tronWeb.fullNode.host)
    : null;
  const chainOrigin = toOrigin(chain.rpcUrl);
  if (walletOrigin && chainOrigin && walletOrigin !== chainOrigin) {
    throw new Error(`Switch TronLink to ${chain.name} before anchoring`);
  }

  onProgress?.({ stage: "connecting", chunksAnchored: 0, chunksTotal: chunks.length });
  const { anchorChunkedFile } = await import("@fileonchain/sdk/tron");

  return anchorChunkedFile(
    {
      address: tronAddress,
      sendMemoTransaction: async (memo) => {
        // 1 SUN self-send — the minimal transaction that can carry the memo.
        let tx = await tronWeb.transactionBuilder.sendTrx(
          tronAddress,
          1,
          tronAddress,
        );
        tx = await tronWeb.transactionBuilder.addUpdateData(tx, memo, "utf8");
        const signed = await tronWeb.trx.sign(tx);
        const receipt = await tronWeb.trx.sendRawTransaction(signed);
        if (!receipt.result) {
          throw new Error("TRON transaction was rejected by the network");
        }
        return { txHash: receipt.txid ?? receipt.transaction?.txID ?? "" };
      },
    },
    { chainId: chain.id, fileCid, chunks, onProgress },
  );
};
