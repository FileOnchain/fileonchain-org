import "server-only";
import type { ChainConfig } from "@fileonchain/sdk";
import type { UploadJobTx } from "@/lib/db/schema";

/** Cosmos server signer: a mnemonic-derived account self-sends one base
 * unit with the anchor payload as the memo. */
export const anchorOnCosmos = async (
  chain: ChainConfig,
  cid: string,
  mnemonic: string,
): Promise<UploadJobTx> => {
  const [{ SigningStargateClient, GasPrice }, { DirectSecp256k1HdWallet }, cosmos] =
    await Promise.all([
      import("@cosmjs/stargate"),
      import("@cosmjs/proto-signing"),
      import("@fileonchain/sdk/cosmos"),
    ]);
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix: chain.bech32Prefix ?? "cosmos",
  });
  const [account] = await wallet.getAccounts();
  const denom = `u${chain.nativeCurrency.symbol.toLowerCase()}`;
  const client = await SigningStargateClient.connectWithSigner(chain.rpcUrl, wallet, {
    gasPrice: GasPrice.fromString(`0.025${denom}`),
  });
  try {
    const { txHash, height } = await cosmos.anchorCIDWithMemo(
      {
        address: account.address,
        sendMemoTransaction: async (memo) => {
          const result = await client.sendTokens(
            account.address,
            account.address,
            [{ denom, amount: "1" }],
            "auto",
            memo,
          );
          if (result.code !== 0) {
            throw new Error(`Cosmos transaction failed: ${result.rawLog ?? result.code}`);
          }
          return { txHash: result.transactionHash, height: result.height };
        },
      },
      { chainId: chain.id, cid },
    );
    return { chainId: chain.id, txHash, blockNumber: height ?? 0 };
  } finally {
    client.disconnect();
  }
};
