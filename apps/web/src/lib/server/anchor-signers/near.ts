import "server-only";
import type { ChainConfig } from "@fileonchain/sdk";
import type { UploadJobTx } from "@/lib/db/schema";

/** NEAR server signer: a full-access key on the configured account calls
 * `anchor_cid` on the registry contract account. */
export const anchorOnNear = async (
  chain: ChainConfig,
  cid: string,
  accountId: string,
  privateKey: string,
): Promise<UploadJobTx> => {
  const [{ Account }, near] = await Promise.all([
    import("near-api-js"),
    import("@fileonchain/sdk/near"),
  ]);
  // near-api-js v7 accepts the RPC url and "ed25519:…" key directly.
  const account = new Account(
    accountId,
    chain.rpcUrl,
    privateKey as `ed25519:${string}`,
  );

  const { txHash } = await near.anchorCID(
    {
      accountId,
      callAnchor: async (contractId, chunkCid, payload) => {
        const outcome = await account.callFunctionRaw({
          contractId,
          methodName: near.ANCHOR_METHOD,
          args: { cid: chunkCid, payload },
          gas: BigInt("30000000000000"),
          deposit: BigInt(0),
        });
        return { txHash: outcome.transaction.hash as string };
      },
    },
    { chainId: chain.id, cid },
  );
  // FinalExecutionOutcome doesn't carry a height; explorers key on the hash.
  return { chainId: chain.id, txHash, blockNumber: 0 };
};
