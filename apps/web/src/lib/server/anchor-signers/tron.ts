import "server-only";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import type { ChainConfig } from "@fileonchain/sdk";
import type { UploadJobTx } from "@/lib/db/schema";

/**
 * TRON server signer — dependency-free: builds a 1-SUN self-send carrying
 * the anchor payload in `extra_data` via the TronGrid REST API, signs the
 * txID locally (secp256k1 over the sha256 the node already computed), and
 * broadcasts.
 */

const post = async <T>(base: string, path: string, body: unknown): Promise<T> => {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`TRON node error ${res.status} on ${path}`);
  return (await res.json()) as T;
};

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString("hex");

/** TRON hex address (0x41-prefixed 21 bytes) from a private key. */
const deriveHexAddress = (privateKey: Uint8Array): string => {
  const publicKey = secp256k1.getPublicKey(privateKey, false);
  return `41${hex(keccak_256(publicKey.subarray(1)).subarray(12))}`;
};

interface TronTransaction {
  txID: string;
  raw_data: unknown;
  raw_data_hex: string;
  Error?: string;
}

export const anchorOnTron = async (
  chain: ChainConfig,
  cid: string,
  privateKeyHex: string,
): Promise<UploadJobTx> => {
  const tron = await import("@fileonchain/sdk/tron");
  const privateKey = Uint8Array.from(
    Buffer.from(privateKeyHex.replace(/^0x/i, ""), "hex"),
  );
  const owner = deriveHexAddress(privateKey);

  const { txHash } = await tron.anchorCIDWithMemo(
    { address: owner, sendMemoTransaction: async (memo) => {
      const tx = await post<TronTransaction>(chain.rpcUrl, "/wallet/createtransaction", {
        owner_address: owner,
        to_address: owner,
        amount: 1,
        extra_data: Buffer.from(memo, "utf8").toString("hex"),
      });
      if (!tx.txID) throw new Error(`TRON createtransaction failed: ${tx.Error ?? "no txID"}`);

      // txID is sha256(raw_data); sign it directly (TronWeb-compatible
      // 65-byte r‖s‖v with v = 27 + recovery). noble's "recovered" format
      // puts the recovery byte first — reorder to trailing-v.
      const digest = Uint8Array.from(Buffer.from(tx.txID, "hex"));
      const recovered = secp256k1.sign(digest, privateKey, { format: "recovered" });
      const signatureHex =
        hex(recovered.subarray(1)) +
        (27 + recovered[0]).toString(16).padStart(2, "0");

      const broadcast = await post<{ result?: boolean; message?: string }>(
        chain.rpcUrl,
        "/wallet/broadcasttransaction",
        { ...tx, signature: [signatureHex] },
      );
      if (!broadcast.result) {
        const detail = broadcast.message
          ? Buffer.from(broadcast.message, "hex").toString("utf8")
          : "rejected";
        throw new Error(`TRON broadcast failed: ${detail}`);
      }
      return { txHash: tx.txID };
    } },
    { chainId: chain.id, cid },
  );
  // Block number lands only after solidification; explorers key on the hash.
  return { chainId: chain.id, txHash, blockNumber: 0 };
};
