import type { ChunkedAnchorReceipt } from "@fileonchain/sdk";
import { useWalletStates } from "@/states/wallet";
import type { AnchorRequest } from "./types";

/**
 * Solana sender — SPL Memo transactions through Phantom / Solflare. The memo
 * program is native to every cluster, so Solana anchors are always real.
 */
export const sendSolanaAnchor = async ({
  chain,
  fileCid,
  chunks,
  includeData,
  uri,
  onProgress,
}: AnchorRequest): Promise<ChunkedAnchorReceipt> => {
  const { solanaAddress } = useWalletStates.getState();
  const provider =
    typeof window === "undefined"
      ? null
      : (window.phantom?.solana ?? window.solana ?? null);
  if (!solanaAddress || !provider) {
    throw new Error("Connect a Solana wallet before anchoring");
  }
  const sendTransaction = provider.signAndSendTransaction?.bind(provider);
  if (!sendTransaction) {
    throw new Error("The connected Solana wallet cannot send transactions");
  }

  onProgress?.({ stage: "connecting", chunksAnchored: 0, chunksTotal: chunks.length });
  const [{ Connection, PublicKey }, { anchorChunkedFile }] = await Promise.all([
    import("@solana/web3.js"),
    import("@fileonchain/sdk/solana"),
  ]);
  const connection = new Connection(chain.rpcUrl, "confirmed");

  return anchorChunkedFile(
    connection,
    {
      publicKey: new PublicKey(solanaAddress),
      signAndSendTransaction: sendTransaction,
    },
    { chainId: chain.id, fileCid, chunks, includeData, uri, onProgress },
  );
};
