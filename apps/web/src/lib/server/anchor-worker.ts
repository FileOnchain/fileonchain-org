import "server-only";
import { keccak256, stringToBytes } from "viem";
import {
  getChain,
  isChainProvisioned,
  ChainNotProvisionedError,
  type ChainConfig,
  type ChainId,
} from "@fileonchain/sdk";
import { env } from "@/lib/env";
import type { UploadJobTx } from "@/lib/db/schema";

/**
 * Anchor worker for the credits/BYOK flows: anchors the file-level CID on
 * each requested chain with a funded server signer, through the same
 * `@fileonchain/sdk` clients the browser uses. (Chunk bytes never reach the
 * backend — only the client-side pay-as-you-go flow anchors per chunk.)
 *
 * A chain anchors for real only when it is provisioned (deployed registry /
 * pallet) AND its signer env var is set; otherwise the worker falls back to
 * the deterministic mock so environments without secrets keep working.
 * Solana/Aptos server signers are still TODO — they mock unconditionally.
 */

const mockTx = (jobId: string, cid: string, chainId: ChainId): UploadJobTx => {
  const seed = keccak256(stringToBytes(`fileonchain-job:${jobId}:${cid}:${chainId}`));
  const blockNumber = 1_000_000 + (parseInt(seed.slice(2, 10), 16) % 20_000_000);
  return { chainId, txHash: seed, blockNumber };
};

const anchorOnEvm = async (
  chain: ChainConfig,
  cid: string,
  privateKey: string,
): Promise<UploadJobTx> => {
  const [{ createPublicClient, createWalletClient, http }, { privateKeyToAccount }, evm] =
    await Promise.all([
      import("viem"),
      import("viem/accounts"),
      import("@fileonchain/sdk/evm"),
    ]);
  const viemChain = evm.toViemChain(chain);
  const walletClient = createWalletClient({
    account: privateKeyToAccount(privateKey as `0x${string}`),
    chain: viemChain,
    transport: http(chain.rpcUrl),
  });
  const txHash = await evm.anchorCID(walletClient, { chainId: chain.id, cid });
  const publicClient = createPublicClient({ chain: viemChain, transport: http(chain.rpcUrl) });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { chainId: chain.id, txHash, blockNumber: Number(receipt.blockNumber) };
};

const anchorOnSubstrate = async (
  chain: ChainConfig,
  cid: string,
  seed: string,
): Promise<UploadJobTx> => {
  const [{ ApiPromise, WsProvider, Keyring }, substrate] = await Promise.all([
    import("@polkadot/api"),
    import("@fileonchain/sdk/substrate"),
  ]);
  const api = await ApiPromise.create({ provider: new WsProvider(chain.rpcUrl) });
  try {
    const pair = new Keyring({ type: "sr25519" }).addFromUri(seed);
    const receipt = await substrate.anchorCIDWithRemark(api, {
      chainId: chain.id,
      address: pair,
      cid,
    });
    const header = await api.rpc.chain.getHeader(receipt.blockHash);
    return {
      chainId: chain.id,
      txHash: receipt.txHash,
      blockNumber: header.number.toNumber(),
    };
  } finally {
    await api.disconnect();
  }
};

const anchorOnChain = async (
  jobId: string,
  cid: string,
  chainId: ChainId,
): Promise<UploadJobTx> => {
  const chain = getChain(chainId);
  if (!chain || !isChainProvisioned(chain)) return mockTx(jobId, cid, chainId);

  try {
    if (chain.family === "evm" && env.anchorEvmPrivateKey) {
      return await anchorOnEvm(chain, cid, env.anchorEvmPrivateKey);
    }
    if (chain.family === "substrate" && env.anchorSubstrateSeed) {
      return await anchorOnSubstrate(chain, cid, env.anchorSubstrateSeed);
    }
  } catch (error) {
    if (error instanceof ChainNotProvisionedError) return mockTx(jobId, cid, chainId);
    throw error; // a configured signer failing is a real failure — surface it
  }

  /* TODO: Solana (memo via funded Keypair) and Aptos (module via funded
   * account) server signers. */
  return mockTx(jobId, cid, chainId);
};

export const runAnchorWorker = async (
  jobId: string,
  cid: string,
  chainIds: ChainId[],
): Promise<UploadJobTx[]> => {
  const results: UploadJobTx[] = [];
  for (const chainId of chainIds) {
    results.push(await anchorOnChain(jobId, cid, chainId));
  }
  return results;
};
