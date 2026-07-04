import "server-only";
import type { ChainConfig } from "@fileonchain/sdk";
import type { UploadJobTx } from "@/lib/db/schema";

/** Sui server signer: a keypair (bech32 `suiprivkey…` export form) executes
 * the anchor move call in one programmable transaction block. */
export const anchorOnSui = async (
  chain: ChainConfig,
  cid: string,
  privateKey: string,
): Promise<UploadJobTx> => {
  const [{ SuiJsonRpcClient }, { Transaction }, { Ed25519Keypair }, sui] = await Promise.all([
    import("@mysten/sui/jsonRpc"),
    import("@mysten/sui/transactions"),
    import("@mysten/sui/keypairs/ed25519"),
    import("@fileonchain/sdk/sui"),
  ]);
  const client = new SuiJsonRpcClient({
    url: chain.rpcUrl,
    network: chain.testnet ? "testnet" : "mainnet",
  });
  const keypair = Ed25519Keypair.fromSecretKey(privateKey);
  const address = keypair.getPublicKey().toSuiAddress();

  const { digest } = await sui.anchorCID(
    {
      address,
      executeAnchorCalls: async (target, calls) => {
        const tx = new Transaction();
        for (const call of calls) {
          tx.moveCall({
            target: target as `${string}::${string}::${string}`,
            arguments: [tx.pure.string(call.cid), tx.pure.string(call.payload)],
          });
        }
        const result = await client.signAndExecuteTransaction({
          signer: keypair,
          transaction: tx,
        });
        return { digest: result.digest };
      },
    },
    { chainId: chain.id, cid },
  );
  const confirmed = await client.getTransactionBlock({ digest });
  return {
    chainId: chain.id,
    txHash: digest,
    blockNumber: Number(confirmed.checkpoint ?? 0),
  };
};
