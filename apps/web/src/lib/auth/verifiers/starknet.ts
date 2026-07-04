import "server-only";
import { getChainsByFamily } from "@fileonchain/sdk";
import type { WalletVerificationInput } from "../verify-wallet";
import { buildStarknetTypedData } from "../wallet-message";

/**
 * SNIP-12 verification for Argent/Braavos. Starknet accounts are contracts,
 * so there is no off-chain recovery: the SNIP-12 hash of our typed data is
 * checked against the account's own `is_valid_signature` view on-chain. The
 * signature travels as a JSON array of felt strings (see useWalletProof).
 * The account must be deployed on one of the configured Starknet networks.
 */

/** Short-string "VALID", the SNIP-6 magic value; pre-SNIP-6 accounts
 * returned 1. */
const VALID_MAGIC = BigInt("0x56414c4944");

export const verifyStarknet = async (
  input: WalletVerificationInput,
  message: string,
): Promise<boolean> => {
  let signature: string[];
  try {
    signature = JSON.parse(input.signature) as string[];
  } catch {
    throw new Error("Starknet signatures must be a JSON array of felts");
  }
  if (!Array.isArray(signature) || signature.length === 0) {
    throw new Error("Starknet signatures must be a non-empty felt array");
  }

  const { RpcProvider, typedData } = await import("starknet");
  const data = buildStarknetTypedData(message);
  const messageHash = typedData.getMessageHash(
    data as Parameters<typeof typedData.getMessageHash>[0],
    input.address,
  );

  let lastError: unknown = null;
  for (const chain of getChainsByFamily("starknet")) {
    const provider = new RpcProvider({ nodeUrl: chain.rpcUrl });
    try {
      const result = await provider.callContract({
        contractAddress: input.address,
        entrypoint: "is_valid_signature",
        calldata: [messageHash, String(signature.length), ...signature],
      });
      const verdict = BigInt(result[0]);
      return verdict === VALID_MAGIC || verdict === 1n;
    } catch (error) {
      // Contract not found on this network (or RPC down) — try the next.
      lastError = error;
    }
  }
  throw new Error(
    "Starknet account not found on any configured network — deploy the account before signing in",
    { cause: lastError },
  );
};
