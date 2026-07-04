import "server-only";
import type { ChainConfig } from "@fileonchain/sdk";
import type { UploadJobTx } from "@/lib/db/schema";

/** TON server signer: a WalletContractV4 derived from the mnemonic sends a
 * minimal self-transfer whose text comment is the anchor payload. */
export const anchorOnTon = async (
  chain: ChainConfig,
  cid: string,
  mnemonic: string,
  apiKey?: string,
): Promise<UploadJobTx> => {
  const [{ TonClient, WalletContractV4, internal }, { mnemonicToPrivateKey }, ton] =
    await Promise.all([
      import("@ton/ton"),
      import("@ton/crypto"),
      import("@fileonchain/sdk/ton"),
    ]);
  const client = new TonClient({ endpoint: chain.rpcUrl, apiKey });
  const keyPair = await mnemonicToPrivateKey(mnemonic.trim().split(/\s+/));
  const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
  const contract = client.open(wallet);
  const address = wallet.address.toString();

  const { txHash } = await ton.anchorCIDWithComment(
    {
      address,
      sendCommentTransaction: async (comment) => {
        const seqno = await contract.getSeqno();
        await contract.sendTransfer({
          secretKey: keyPair.secretKey,
          seqno,
          messages: [
            internal({ to: wallet.address, value: "0.001", body: comment }),
          ],
        });
        // sendTransfer is fire-and-forget; poll until the wallet's seqno
        // advances, then read the newest transaction hash.
        for (let attempt = 0; attempt < 20; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          if ((await contract.getSeqno()) > seqno) break;
        }
        const [latest] = await client.getTransactions(wallet.address, { limit: 1 });
        return { txHash: latest ? latest.hash().toString("hex") : "" };
      },
    },
    { chainId: chain.id, cid },
  );
  return { chainId: chain.id, txHash, blockNumber: 0 };
};
