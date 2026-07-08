import type { ChunkedAnchorReceipt } from "@fileonchain/sdk";
import { useWalletStates } from "@/states/wallet";
import { getStarknetAccount } from "@/hooks/useStarknetWallet";
import type { AnchorRequest } from "./types";

/**
 * Starknet sender — free `anchor_cid` multicalls on the Cairo FileRegistry
 * through Argent X / Braavos, then a paid `propose_anchor` for the file CID
 * when the chain is propose-provisioned. Starknet accounts execute
 * multicalls natively, so a batch of chunk anchors — and even the ERC-20
 * approve + propose pair — each cost one wallet approval.
 */
export const sendStarknetAnchor = async ({
  chain,
  fileCid,
  chunks,
  platformId,
  tip,
  onProgress,
}: AnchorRequest): Promise<ChunkedAnchorReceipt> => {
  const { starknetAddress } = useWalletStates.getState();
  const account = getStarknetAccount();
  if (!starknetAddress || !account) {
    throw new Error("Connect a Starknet wallet before anchoring");
  }

  onProgress?.({ stage: "connecting", chunksAnchored: 0, chunksTotal: chunks.length });
  const [{ CallData, byteArray, cairo, RpcProvider }, { anchorChunkedFile, ANCHOR_ENTRYPOINT, PROPOSE_ENTRYPOINT }] =
    await Promise.all([import("starknet"), import("@fileonchain/sdk/starknet")]);
  const provider = new RpcProvider({ nodeUrl: chain.rpcUrl });

  return anchorChunkedFile(
    {
      address: starknetAddress,
      executeAnchorCalls: async (registryContract, calls) => {
        const result = await account.execute(
          calls.map((call) => ({
            contractAddress: registryContract,
            entrypoint: ANCHOR_ENTRYPOINT,
            calldata: CallData.compile([
              byteArray.byteArrayFromString(call.cid),
              byteArray.byteArrayFromString(call.payload),
            ]),
          })),
        );
        return { transactionHash: result.transaction_hash };
      },
      executeProposeCall: async (call) => {
        const result = await account.execute([
          {
            contractAddress: call.tokenContract,
            entrypoint: "approve",
            calldata: CallData.compile([
              call.anchorRegistryContract,
              cairo.uint256(call.approveAmount),
            ]),
          },
          {
            contractAddress: call.anchorRegistryContract,
            entrypoint: PROPOSE_ENTRYPOINT,
            calldata: CallData.compile([
              byteArray.byteArrayFromString(call.cid),
              cairo.uint256(call.contentHash),
              byteArray.byteArrayFromString(call.uri),
              call.platformId,
              cairo.uint256(call.tip),
            ]),
          },
        ]);
        return { transactionHash: result.transaction_hash };
      },
      callContract: async (contractAddress, entrypoint, calldata) =>
        provider.callContract({ contractAddress, entrypoint, calldata }),
    },
    { chainId: chain.id, fileCid, chunks, platformId, tip, onProgress },
  );
};
