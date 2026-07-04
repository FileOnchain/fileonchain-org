import "server-only";
import type { ChainConfig } from "@fileonchain/sdk";
import type { UploadJobTx } from "@/lib/db/schema";

/** Cardano server signer: a CLI payment signing key + Blockfrost build and
 * submit the metadata-carrying self-payment. */
export const anchorOnCardano = async (
  chain: ChainConfig,
  cid: string,
  signingKey: string,
  blockfrostKey: string,
): Promise<UploadJobTx> => {
  const [{ MeshWallet, Transaction, BlockfrostProvider }, cardano] = await Promise.all([
    import("@meshsdk/core"),
    import("@fileonchain/sdk/cardano"),
  ]);
  const provider = new BlockfrostProvider(blockfrostKey);
  const wallet = new MeshWallet({
    networkId: chain.testnet ? 0 : 1,
    fetcher: provider,
    submitter: provider,
    key: { type: "cli", payment: signingKey },
  });
  const address = await wallet.getChangeAddress();

  const { txHash } = await cardano.anchorCIDWithMetadata(
    {
      address,
      submitMetadataTransaction: async (messageChunks) => {
        const tx = new Transaction({ initiator: wallet });
        // A minimal self-payment carries the metadata.
        tx.sendLovelace(address, "1000000");
        tx.setMetadata(cardano.CARDANO_METADATA_LABEL, { msg: messageChunks });
        const unsigned = await tx.build();
        const signed = await wallet.signTx(unsigned);
        return { txHash: await wallet.submitTx(signed) };
      },
    },
    { chainId: chain.id, cid },
  );
  // Slot/height lands with confirmation; explorers key on the hash.
  return { chainId: chain.id, txHash, blockNumber: 0 };
};
