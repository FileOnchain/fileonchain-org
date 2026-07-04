import "server-only";
import type { ChainConfig } from "@fileonchain/sdk";
import type { UploadJobTx } from "@/lib/db/schema";

/** Hedera server signer: the operator account submits the anchor payload as
 * a Consensus Service message on the chain's configured topic. */
export const anchorOnHedera = async (
  chain: ChainConfig,
  cid: string,
  operatorId: string,
  privateKey: string,
): Promise<UploadJobTx> => {
  const [{ Client, TopicMessageSubmitTransaction }, hedera] = await Promise.all([
    import("@hashgraph/sdk"),
    import("@fileonchain/sdk/hedera"),
  ]);
  const client = chain.testnet ? Client.forTestnet() : Client.forMainnet();
  client.setOperator(operatorId, privateKey);
  try {
    const { txHash, sequenceNumber } = await hedera.anchorCIDWithMessage(
      {
        accountId: operatorId,
        submitTopicMessage: async (topicId, message) => {
          const response = await new TopicMessageSubmitTransaction({
            topicId,
            message,
          }).execute(client);
          const receipt = await response.getReceipt(client);
          return {
            txHash: response.transactionId.toString(),
            sequenceNumber: receipt.topicSequenceNumber
              ? Number(receipt.topicSequenceNumber)
              : undefined,
          };
        },
      },
      { chainId: chain.id, cid },
    );
    return { chainId: chain.id, txHash, blockNumber: sequenceNumber ?? 0 };
  } finally {
    client.close();
  }
};
