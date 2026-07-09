import type { ChunkedAnchorReceipt } from "@fileonchain/sdk";
import { useWalletStates } from "@/states/wallet";
import { getNearProvider } from "@/hooks/useNearWallet";
import type { AnchorRequest } from "./types";

/**
 * NEAR sender — sequential free `anchor_cid` contract calls through the
 * injected `window.near` provider (Sender / Meteor), then a paid
 * `ft_transfer_call` on the FOCAT token for the file CID (tip + bond
 * escrowed via the registry's ft_on_transfer) when the chain is
 * propose-provisioned. Until a registry contract account lands in the SDK
 * chain registry, anchorChunkedFile throws ChainNotProvisionedError and
 * the uploader falls back to the simulated flow.
 */
export const sendNearAnchor = async ({
  chain,
  fileCid,
  chunks,
  platformId,
  tip,
  includeData,
  uri,
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

  const sendFunctionCall = async (
    receiverId: string,
    methodName: string,
    args: Record<string, unknown>,
    deposit: string,
    gas: string,
  ) => {
    const outcome = await provider.signAndSendTransaction({
      receiverId,
      actions: [
        {
          type: "FunctionCall",
          params: { methodName, args, gas, deposit },
        },
      ],
    });
    // Sender / Meteor resolve with the RPC FinalExecutionOutcome object.
    const txHash =
      (outcome as { transaction?: { hash?: string } })?.transaction?.hash ?? "";
    return { txHash };
  };

  return anchorChunkedFile(
    {
      accountId: nearAddress,
      callAnchor: (contractId, cid, payload) =>
        sendFunctionCall(contractId, ANCHOR_METHOD, { cid, payload }, "0", "30000000000000"),
      callMethod: (contractId, method, args, options) =>
        sendFunctionCall(
          contractId,
          method,
          args,
          options?.attachedDeposit ?? "0",
          options?.gas ?? "30000000000000",
        ),
    },
    { chainId: chain.id, fileCid, chunks, platformId, tip, includeData, uri, onProgress },
  );
};
