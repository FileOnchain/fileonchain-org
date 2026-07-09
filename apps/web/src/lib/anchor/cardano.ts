import type { ChunkedAnchorReceipt } from "@fileonchain/sdk";
import { useWalletStates } from "@/states/wallet";
import { getCardanoWalletKey } from "@/hooks/useCardanoWallet";
import type { AnchorRequest } from "./types";

/**
 * Cardano sender — CIP-20 metadata transactions through a CIP-30 wallet,
 * built with Mesh. Each anchor is a minimal self-payment whose metadata
 * carries the payload under `CARDANO_METADATA_LABEL`.
 */
export const sendCardanoAnchor = async ({
  chain,
  fileCid,
  chunks,
  includeData,
  uri,
  onProgress,
}: AnchorRequest): Promise<ChunkedAnchorReceipt> => {
  const { cardanoAddress } = useWalletStates.getState();
  const walletKey = getCardanoWalletKey();
  if (!cardanoAddress || !walletKey) {
    throw new Error("Connect a Cardano wallet before anchoring");
  }

  onProgress?.({ stage: "connecting", chunksAnchored: 0, chunksTotal: chunks.length });
  const [{ BrowserWallet, Transaction }, { anchorChunkedFile, CARDANO_METADATA_LABEL }] =
    await Promise.all([
      import("@meshsdk/core"),
      import("@fileonchain/sdk/cardano"),
    ]);
  const wallet = await BrowserWallet.enable(walletKey);

  return anchorChunkedFile(
    {
      address: cardanoAddress,
      submitMetadataTransaction: async (messageChunks) => {
        // A transaction must move value, so a minimal self-payment (1 ADA
        // back to our own address) carries the metadata.
        const tx = new Transaction({ initiator: wallet });
        tx.sendLovelace(cardanoAddress, "1000000");
        tx.setMetadata(CARDANO_METADATA_LABEL, { msg: messageChunks });
        const unsigned = await tx.build();
        const signed = await wallet.signTx(unsigned);
        const txHash = await wallet.submitTx(signed);
        return { txHash };
      },
    },
    { chainId: chain.id, fileCid, chunks, includeData, uri, onProgress },
  );
};
