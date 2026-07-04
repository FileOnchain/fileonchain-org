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
 * pallet / module) AND its signer env var is set; otherwise the worker falls
 * back to the deterministic mock so environments without secrets keep
 * working. Signers: ANCHOR_EVM_PRIVATE_KEY, ANCHOR_SUBSTRATE_SEED,
 * ANCHOR_SOLANA_SECRET_KEY, ANCHOR_APTOS_PRIVATE_KEY.
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

/* Solana keypairs travel as either a base58 string (Phantom export) or a
 * JSON byte array (solana-keygen file) — accept both. */
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const decodeBase58 = (value: string): Uint8Array => {
  let num = 0n;
  for (const char of value) {
    const index = BASE58_ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`Invalid base58 character "${char}" in Solana secret key.`);
    num = num * 58n + BigInt(index);
  }
  const bytes: number[] = [];
  while (num > 0n) {
    bytes.unshift(Number(num % 256n));
    num /= 256n;
  }
  for (const char of value) {
    if (char !== BASE58_ALPHABET[0]) break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
};

const parseSolanaSecretKey = (raw: string): Uint8Array => {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) return Uint8Array.from(JSON.parse(trimmed) as number[]);
  return decodeBase58(trimmed);
};

const anchorOnSolana = async (
  chain: ChainConfig,
  cid: string,
  secretKey: string,
): Promise<UploadJobTx> => {
  const [{ Connection, Keypair }, solana] = await Promise.all([
    import("@solana/web3.js"),
    import("@fileonchain/sdk/solana"),
  ]);
  const connection = new Connection(chain.rpcUrl, "confirmed");
  const keypair = Keypair.fromSecretKey(parseSolanaSecretKey(secretKey));
  const { signature, slot } = await solana.anchorCIDWithMemo(
    connection,
    {
      publicKey: keypair.publicKey,
      signAndSendTransaction: async (transaction) => {
        transaction.sign(keypair);
        return { signature: await connection.sendRawTransaction(transaction.serialize()) };
      },
    },
    { chainId: chain.id, cid },
  );
  return { chainId: chain.id, txHash: signature, blockNumber: slot };
};

const anchorOnAptos = async (
  chain: ChainConfig,
  cid: string,
  privateKey: string,
): Promise<UploadJobTx> => {
  const [{ Aptos, AptosConfig, Account, Ed25519PrivateKey }, aptos] = await Promise.all([
    import("@aptos-labs/ts-sdk"),
    import("@fileonchain/sdk/aptos"),
  ]);
  const client = new Aptos(new AptosConfig({ fullnode: chain.rpcUrl }));
  const account = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(privateKey) });
  const { hash } = await aptos.anchorCID(
    {
      address: account.accountAddress.toString(),
      signAndSubmitTransaction: async (payload) => {
        const transaction = await client.transaction.build.simple({
          sender: account.accountAddress,
          data: {
            function: payload.function as `${string}::${string}::${string}`,
            typeArguments: payload.type_arguments,
            functionArguments: payload.arguments as (string | number)[],
          },
        });
        const pending = await client.signAndSubmitTransaction({ signer: account, transaction });
        return { hash: pending.hash };
      },
    },
    { chainId: chain.id, cid },
  );
  const committed = await client.waitForTransaction({ transactionHash: hash });
  // Aptos has no per-tx block number; the ledger version is the analog.
  return { chainId: chain.id, txHash: hash, blockNumber: Number(committed.version) };
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
    if (chain.family === "solana" && env.anchorSolanaSecretKey) {
      return await anchorOnSolana(chain, cid, env.anchorSolanaSecretKey);
    }
    if (chain.family === "aptos" && env.anchorAptosPrivateKey) {
      return await anchorOnAptos(chain, cid, env.anchorAptosPrivateKey);
    }
  } catch (error) {
    if (error instanceof ChainNotProvisionedError) return mockTx(jobId, cid, chainId);
    throw error; // a configured signer failing is a real failure — surface it
  }

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
