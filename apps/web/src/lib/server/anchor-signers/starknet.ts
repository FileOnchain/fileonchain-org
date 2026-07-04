import "server-only";
import type { ChainConfig } from "@fileonchain/sdk";
import type { UploadJobTx } from "@/lib/db/schema";

/** Starknet server signer: a deployed account contract (address + key)
 * executes the anchor multicall against the Cairo registry. */
export const anchorOnStarknet = async (
  chain: ChainConfig,
  cid: string,
  accountAddress: string,
  privateKey: string,
): Promise<UploadJobTx> => {
  const [{ Account, RpcProvider, CallData, byteArray }, starknet] = await Promise.all([
    import("starknet"),
    import("@fileonchain/sdk/starknet"),
  ]);
  const provider = new RpcProvider({ nodeUrl: chain.rpcUrl });
  const account = new Account({ provider, address: accountAddress, signer: privateKey });

  // The SDK receipt carries only the hash; capture the block from the
  // wait-for-receipt step here.
  let lastBlockNumber = 0;
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
        const receipt = await provider.waitForTransaction(hash);
        if ("block_number" in receipt) {
          lastBlockNumber = Number(receipt.block_number);
        }
        return { transactionHash: hash, blockNumber: lastBlockNumber };
      },
    },
    { chainId: chain.id, cid },
  );
  return { chainId: chain.id, txHash: transactionHash, blockNumber: lastBlockNumber };
};
