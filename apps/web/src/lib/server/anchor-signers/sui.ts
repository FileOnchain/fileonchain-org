import "server-only";
import type { ChainConfig } from "@fileonchain/sdk";
import type { UploadJobTx } from "@/lib/db/schema";

/** Sui server signer: a keypair (bech32 `suiprivkey…` export form) executes
 * the anchor move call in one programmable transaction block. File-level
 * anchors go through `anchor_registry::propose_anchor` (exact FOCAT coin
 * split, tip + bond escrowed) when the chain is propose-provisioned. */
export const anchorOnSui = async (
  chain: ChainConfig,
  cid: string,
  privateKey: string,
): Promise<UploadJobTx> => {
  const [{ SuiJsonRpcClient }, { Transaction, coinWithBalance }, { Ed25519Keypair }, sui] =
    await Promise.all([
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
      executeProposeCall: async (call) => {
        const tx = new Transaction();
        tx.setSender(address);
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
            tx.object(sui.SUI_CLOCK_OBJECT_ID),
          ],
        });
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
