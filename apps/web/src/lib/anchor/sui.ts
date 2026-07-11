import type { ChunkedAnchorReceipt } from "@fileonchain/sdk";
import { useWalletStates } from "@/states/wallet";
import { getConnectedSuiWallet } from "@/hooks/useSuiWallet";
import type { AnchorRequest } from "./types";

interface SuiSignAndExecuteTransactionFeature {
  signAndExecuteTransaction(input: {
    transaction: unknown;
    account: { address: string; publicKey: Uint8Array };
    chain: string;
  }): Promise<{ digest: string }>;
}

/**
 * Sui sender — free `file_registry::anchor_cid` move calls batched into
 * programmable transaction blocks, signed by the wallet-standard wallet the
 * user connected via useSuiWallet. Our chain ids ("sui:mainnet" /
 * "sui:testnet") double as wallet-standard chain identifiers, so `chain.id`
 * is passed straight to the wallet.
 */
export const sendSuiAnchor = async ({
  chain,
  fileCid,
  chunks,
  platformId,
  includeData,
  uri,
  onProgress,
}: AnchorRequest): Promise<ChunkedAnchorReceipt> => {
  const { suiAddress } = useWalletStates.getState();
  const connection = getConnectedSuiWallet();
  if (!suiAddress || !connection) {
    throw new Error("Connect a Sui wallet before anchoring");
  }
  const { wallet, account } = connection;
  const feature = wallet.features["sui:signAndExecuteTransaction"] as
    | SuiSignAndExecuteTransactionFeature
    | undefined;
  if (!feature?.signAndExecuteTransaction) {
    throw new Error("The connected Sui wallet cannot send transactions");
  }

  onProgress?.({ stage: "connecting", chunksAnchored: 0, chunksTotal: chunks.length });
  const [{ Transaction }, { anchorChunkedFile }] =
    await Promise.all([import("@mysten/sui/transactions"), import("@fileonchain/sdk/sui")]);

  return anchorChunkedFile(
    {
      address: suiAddress,
      executeAnchorCalls: async (target, calls) => {
        const tx = new Transaction();
        for (const call of calls) {
          tx.moveCall({
            target: target as `${string}::${string}::${string}`,
            arguments: [tx.pure.string(call.cid), tx.pure.string(call.payload)],
          });
        }
        const { digest } = await feature.signAndExecuteTransaction({
          transaction: tx,
          account,
          chain: chain.id,
        });
        return { digest };
      },
    },
    { chainId: chain.id, fileCid, chunks, platformId, includeData, uri, onProgress },
  );
};
