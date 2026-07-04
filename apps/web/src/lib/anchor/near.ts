import type { ChunkedAnchorReceipt } from "@fileonchain/sdk";
import { useWalletStates } from "@/states/wallet";
import { getNearProvider } from "@/hooks/useNearWallet";
import type { AnchorRequest } from "./types";

/**
 * NEAR sender — sequential `anchor_cid` contract calls through the injected
 * `window.near` provider (Sender / Meteor). Until a registry contract account
 * lands in the SDK chain registry, anchorChunkedFile throws
 * ChainNotProvisionedError and the uploader falls back to the simulated flow.
 */
export const sendNearAnchor = async ({
  chain,
  fileCid,
  chunks,
  onProgress,
}: AnchorRequest): Promise<ChunkedAnchorReceipt> => {
  const { nearAddress } = useWalletStates.getState();
  const provider = getNearProvider();
  if (!nearAddress || !provider) {
    throw new Error("Connect a NEAR wallet before anchoring");
  }

  onProgress?.({ stage: "connecting", chunksAnchored: 0, chunksTotal: chunks.length });
  const { anchorChunkedFile, ANCHOR_METHOD } = await import(
    "@fileonchain/sdk/near"
  );

  return anchorChunkedFile(
    {
      accountId: nearAddress,
      callAnchor: async (contractId, cid, payload) => {
        const outcome = await provider.signAndSendTransaction({
          receiverId: contractId,
          actions: [
            {
              type: "FunctionCall",
              params: {
                methodName: ANCHOR_METHOD,
                args: { cid, payload },
                gas: "30000000000000",
                deposit: "0",
              },
            },
          ],
        });
        // Sender / Meteor resolve with the RPC FinalExecutionOutcome object.
        const txHash =
          (outcome as { transaction?: { hash?: string } })?.transaction?.hash ??
          "";
        return { txHash };
      },
    },
    { chainId: chain.id, fileCid, chunks, onProgress },
  );
};
