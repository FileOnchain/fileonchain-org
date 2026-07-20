import type { ChunkedAnchorReceipt } from "@fileonchain/sdk";
import { useWalletStates } from "@/states/wallet";
import { getStarknetAccount } from "@/hooks/useStarknetWallet";
import type { AnchorRequest } from "./types";

/**
 * Starknet sender — free `anchor_cid` multicalls on the Cairo FileRegistry
 * through Argent X / Braavos. Starknet accounts execute multicalls
 * natively, so a batch of chunk anchors costs one wallet approval.
 */
export const sendStarknetAnchor = async ({
  chain,
  fileCid,
  chunks,
  platformId,
  includeData,
  uri,
  onProgress,
}: AnchorRequest): Promise<ChunkedAnchorReceipt> => {
  const { starknetAddress } = useWalletStates.getState();
  const account = getStarknetAccount();
  if (!starknetAddress || !account) {
    throw new Error("Connect a Starknet wallet before anchoring");
  }

  onProgress?.({ stage: "connecting", chunksAnchored: 0, chunksTotal: chunks.length });
  const [{ CallData, byteArray }, { anchorChunkedFile, ANCHOR_ENTRYPOINT }] =
    await Promise.all([import("starknet"), import("@fileonchain/sdk/starknet")]);

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
    },
    { chainId: chain.id, fileCid, chunks, platformId, includeData, uri, onProgress },
  );
};
