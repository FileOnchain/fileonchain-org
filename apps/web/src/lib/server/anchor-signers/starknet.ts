import "server-only";
import type { ChainConfig } from "@fileonchain/sdk";
import type { UploadJobTx } from "@/lib/db/schema";

/** Starknet server signer: a deployed account contract (address + key)
 * executes the anchor multicall against the Cairo registry. File-level
 * anchors go through the AnchorRegistry's approve + propose_anchor
 * multicall (FOCAT tip + bond escrowed) when the chain is
 * propose-provisioned. */
export const anchorOnStarknet = async (
  chain: ChainConfig,
  cid: string,
  accountAddress: string,
  privateKey: string,
): Promise<UploadJobTx> => {
  const [{ Account, RpcProvider, CallData, byteArray, cairo }, starknet] = await Promise.all([
    import("starknet"),
    import("@fileonchain/sdk/starknet"),
  ]);
  const provider = new RpcProvider({ nodeUrl: chain.rpcUrl });
  const account = new Account({ provider, address: accountAddress, signer: privateKey });

  // The SDK receipt carries only the hash; capture the block from the
  // wait-for-receipt step here.
  let lastBlockNumber = 0;
  const waitForBlock = async (hash: string) => {
    const receipt = await provider.waitForTransaction(hash);
    if ("block_number" in receipt) {
      lastBlockNumber = Number(receipt.block_number);
    }
  };
  const { transactionHash } = await starknet.anchorCID(
    {
      address: accountAddress,
      executeAnchorCalls: async (registryContract, calls) => {
        const { transaction_hash: hash } = await account.execute(
          calls.map((call) => ({
            contractAddress: registryContract,
            entrypoint: starknet.ANCHOR_ENTRYPOINT,
            calldata: CallData.compile([
              byteArray.byteArrayFromString(call.cid),
              byteArray.byteArrayFromString(call.payload),
            ]),
          })),
        );
        await waitForBlock(hash);
        return { transactionHash: hash, blockNumber: lastBlockNumber };
      },
      executeProposeCall: async (call) => {
        const { transaction_hash: hash } = await account.execute([
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
            entrypoint: starknet.PROPOSE_ENTRYPOINT,
            calldata: CallData.compile([
              byteArray.byteArrayFromString(call.cid),
              cairo.uint256(call.contentHash),
              byteArray.byteArrayFromString(call.uri),
              call.platformId,
              cairo.uint256(call.tip),
            ]),
          },
        ]);
        await waitForBlock(hash);
        return { transactionHash: hash, blockNumber: lastBlockNumber };
      },
      callContract: async (contractAddress, entrypoint, calldata) =>
        provider.callContract({ contractAddress, entrypoint, calldata }),
    },
    { chainId: chain.id, cid },
  );
  return { chainId: chain.id, txHash: transactionHash, blockNumber: lastBlockNumber };
};
