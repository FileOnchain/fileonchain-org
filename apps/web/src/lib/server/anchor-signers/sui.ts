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
  // @mysten/sui v3 removed the JSON-RPC transport: `@mysten/sui/jsonRpc` still
  // loads but every export throws at runtime. gRPC is the supported transport.
  const [{ SuiGrpcClient }, { Transaction }, { Ed25519Keypair }, sui] =
    await Promise.all([
      import("@mysten/sui/grpc"),
      import("@mysten/sui/transactions"),
      import("@mysten/sui/keypairs/ed25519"),
      import("@fileonchain/sdk/sui"),
    ]);
  const client = new SuiGrpcClient({
    network: chain.testnet ? "testnet" : "mainnet",
    baseUrl: chain.rpcUrl,
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
        // v3 returns a discriminated union instead of throwing on an on-chain
        // abort: an executed-but-aborted transaction comes back as
        // `FailedTransaction`.
        if (!result.Transaction) {
          throw new Error(
            `Sui anchor transaction failed: ${result.FailedTransaction?.status.error?.message ?? "unknown error"}`,
          );
        }
        return { digest: result.Transaction.digest };
      },
    },
    { chainId: chain.id, cid },
  );
  // gRPC reads trail execution slightly, so wait for the transaction to be
  // fetchable before reading back its checkpoint.
  const confirmed = await client.waitForTransaction({ digest });
  const tx = confirmed.Transaction ?? confirmed.FailedTransaction;
  return {
    chainId: chain.id,
    txHash: digest,
    blockNumber: Number(tx?.checkpoint ?? 0),
  };
};
