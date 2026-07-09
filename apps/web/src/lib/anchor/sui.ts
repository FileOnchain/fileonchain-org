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
 * programmable transaction blocks, then a paid
 * `anchor_registry::propose_anchor` for the file CID (an exact FOCAT coin
 * split in the PTB — Sui has no allowances) when the chain is
 * propose-provisioned, signed by the wallet-standard wallet the user
 * connected via useSuiWallet. Our chain ids ("sui:mainnet" / "sui:testnet")
 * double as wallet-standard chain identifiers, so `chain.id` is passed
 * straight to the wallet.
 */
export const sendSuiAnchor = async ({
  chain,
  fileCid,
  chunks,
  platformId,
  tip,
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
  const [{ Transaction, coinWithBalance }, { anchorChunkedFile, SUI_CLOCK_OBJECT_ID }] =
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
      executeProposeCall: async (call) => {
        const tx = new Transaction();
        tx.setSender(suiAddress);
        tx.moveCall({
          target: call.target as `${string}::${string}::${string}`,
          arguments: [
            tx.object(call.registryObjectId),
            coinWithBalance({ balance: BigInt(call.paymentAmount), type: call.coinType }),
            tx.pure.string(call.cid),
            tx.pure.vector("u8", call.contentHash),
            tx.pure.string(call.uri),
            tx.pure.u64(BigInt(call.platformId)),
            tx.pure.u64(BigInt(call.tip)),
            tx.object(SUI_CLOCK_OBJECT_ID),
          ],
        });
        const { digest } = await feature.signAndExecuteTransaction({
          transaction: tx,
          account,
          chain: chain.id,
        });
        return { digest };
      },
    },
    { chainId: chain.id, fileCid, chunks, platformId, tip, includeData, uri, onProgress },
  );
};
