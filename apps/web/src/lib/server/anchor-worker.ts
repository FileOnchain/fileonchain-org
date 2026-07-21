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
import { RPC_TRANSPORT_OPTS } from "@/lib/scan-window";
import {
  validateRpcUrl,
  withRpcOverride,
  type CustomRpcMap,
} from "@/lib/rpc-endpoints";
import type { UploadJobTx } from "@/lib/db/schema";

/**
 * Anchor worker for the credits/BYOK flows: anchors the file-level CID on
 * each requested chain with a funded server signer, through the same
 * `@fileonchain/sdk` clients the browser uses. (Chunk bytes never reach the
 * backend — only the client-side pay-as-you-go flow anchors per chunk.)
 *
 * A chain anchors for real only when it is provisioned (deployed registry /
 * pallet / module / memo mode) AND its signer env vars are set; otherwise
 * the worker falls back to the deterministic mock so environments without
 * secrets keep working. EVM/Substrate/Solana/Aptos signers live inline
 * below; every Tier 2 family has its own module under ./anchor-signers/.
 * The env vars per family are documented in apps/web/.env.example.
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
  platformId: string,
): Promise<UploadJobTx> => {
  const [{ createWalletClient, http }, { privateKeyToAccount }, evm] = await Promise.all([
    import("viem"),
    import("viem/accounts"),
    import("@fileonchain/sdk/evm"),
  ]);
  const viemChain = evm.toViemChain(chain);
  const walletClient = createWalletClient({
    account: privateKeyToAccount(privateKey as `0x${string}`),
    chain: viemChain,
    transport: http(chain.rpcUrl, RPC_TRANSPORT_OPTS),
  });
  // anchorCID emits the free file-level registry event and waits for its
  // receipt — the block data goes straight into the job's tx record.
  const receipt = await evm.anchorCID(walletClient, {
    chainId: chain.id,
    cid,
    platformId,
  });
  return {
    chainId: chain.id,
    txHash: receipt.txHash,
    blockNumber: receipt.blockNumber,
  };
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
  platformId: string,
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
    { chainId: chain.id, cid, platformId },
  );
  const committed = await client.waitForTransaction({ transactionHash: hash });
  // Aptos has no per-tx block number; the ledger version is the analog.
  return { chainId: chain.id, txHash: hash, blockNumber: Number(committed.version) };
};

/** Dispatch to the configured signer for the family; null when no signer env is set. */
const sendWithSigner = async (
  chain: ChainConfig,
  cid: string,
  platformId: string,
): Promise<UploadJobTx | null> => {
  if (chain.family === "evm" && env.anchorEvmPrivateKey) {
    return await anchorOnEvm(chain, cid, env.anchorEvmPrivateKey, platformId);
  }
  if (chain.family === "substrate" && env.anchorSubstrateSeed) {
    return await anchorOnSubstrate(chain, cid, env.anchorSubstrateSeed);
  }
  if (chain.family === "solana" && env.anchorSolanaSecretKey) {
    return await anchorOnSolana(chain, cid, env.anchorSolanaSecretKey);
  }
  if (chain.family === "aptos" && env.anchorAptosPrivateKey) {
    return await anchorOnAptos(chain, cid, env.anchorAptosPrivateKey, platformId);
  }
  if (chain.family === "cosmos" && env.anchorCosmosMnemonic) {
    const { anchorOnCosmos } = await import("./anchor-signers/cosmos");
    return await anchorOnCosmos(chain, cid, env.anchorCosmosMnemonic);
  }
  if (chain.family === "sui" && env.anchorSuiPrivateKey) {
    const { anchorOnSui } = await import("./anchor-signers/sui");
    return await anchorOnSui(chain, cid, env.anchorSuiPrivateKey);
  }
  if (
    chain.family === "starknet" &&
    env.anchorStarknetAccount &&
    env.anchorStarknetPrivateKey
  ) {
    const { anchorOnStarknet } = await import("./anchor-signers/starknet");
    return await anchorOnStarknet(
      chain,
      cid,
      env.anchorStarknetAccount,
      env.anchorStarknetPrivateKey,
    );
  }
  if (chain.family === "near" && env.anchorNearAccountId && env.anchorNearPrivateKey) {
    const { anchorOnNear } = await import("./anchor-signers/near");
    return await anchorOnNear(chain, cid, env.anchorNearAccountId, env.anchorNearPrivateKey);
  }
  if (chain.family === "tron" && env.anchorTronPrivateKey) {
    const { anchorOnTron } = await import("./anchor-signers/tron");
    return await anchorOnTron(chain, cid, env.anchorTronPrivateKey);
  }
  // Cardano's signer talks to Blockfrost via its project key, not
  // chain.rpcUrl — custom RPC overrides don't apply here.
  if (
    chain.family === "cardano" &&
    env.anchorCardanoSigningKey &&
    env.anchorCardanoBlockfrostKey
  ) {
    const { anchorOnCardano } = await import("./anchor-signers/cardano");
    return await anchorOnCardano(
      chain,
      cid,
      env.anchorCardanoSigningKey,
      env.anchorCardanoBlockfrostKey,
    );
  }
  if (chain.family === "ton" && env.anchorTonMnemonic) {
    const { anchorOnTon } = await import("./anchor-signers/ton");
    return await anchorOnTon(chain, cid, env.anchorTonMnemonic, env.anchorTonApiKey);
  }
  // Hedera's signer uses the SDK's built-in network map
  // (Client.forMainnet/forTestnet), not chain.rpcUrl — overrides don't apply.
  if (
    chain.family === "hedera" &&
    env.anchorHederaOperatorId &&
    env.anchorHederaPrivateKey
  ) {
    const { anchorOnHedera } = await import("./anchor-signers/hedera");
    return await anchorOnHedera(
      chain,
      cid,
      env.anchorHederaOperatorId,
      env.anchorHederaPrivateKey,
    );
  }
  return null;
};

interface AnchorSendResult {
  tx: UploadJobTx;
  /** True when the send was the deterministic mock, not a real transaction. */
  simulated: boolean;
}

const anchorOnChain = async (
  jobId: string,
  cid: string,
  chainId: ChainId,
  platformId: string,
  rpcOverrides: CustomRpcMap = {},
): Promise<AnchorSendResult> => {
  const simulated = (): AnchorSendResult => ({
    tx: mockTx(jobId, cid, chainId),
    simulated: true,
  });

  const registryChain = getChain(chainId);
  if (!registryChain || !isChainProvisioned(registryChain)) {
    return simulated();
  }

  // Provisioning is judged on the registry entry; only the endpoint we dial
  // changes. Re-check the stored URL (defense in depth — rows are validated
  // at write time) and ignore it rather than fail the job if it went bad.
  let chain = withRpcOverride(registryChain, rpcOverrides);
  if (chain !== registryChain && validateRpcUrl(chain.family, chain.rpcUrl)) {
    chain = registryChain;
  }

  try {
    const sent = await sendWithSigner(chain, cid, platformId);
    if (sent) {
      return { tx: sent, simulated: false };
    }
  } catch (error) {
    if (error instanceof ChainNotProvisionedError) return simulated();
    throw error; // a configured signer failing is a real failure — surface it
  }

  return simulated();
};

export interface AnchorWorkerResult {
  txs: UploadJobTx[];
}

export const runAnchorWorker = async (
  jobId: string,
  cid: string,
  chainIds: ChainId[],
  rpcOverrides: CustomRpcMap = {},
  platformId: string = env.anchorPlatformId,
): Promise<AnchorWorkerResult> => {
  if (chainIds.length === 0) return { txs: [] };
  // Each `anchorOnChain` is independent — own RPC, own signer, own
  // nonce space — so fan the sends out and let the slowest chain
  // dictate the wall clock rather than the sum. Results are
  // re-ordered to match the input so `upload_job.tx_hashes` keeps
  // its position-per-chain shape (the worker swallows the partial
  // work on a sibling's failure — the caller's existing refund +
  // fail-the-job semantics stay intact regardless of ordering).
  const settled = await Promise.allSettled(
    chainIds.map((chainId) =>
      anchorOnChain(jobId, cid, chainId, platformId, rpcOverrides),
    ),
  );
  const txs: UploadJobTx[] = chainIds.map((_, idx) => {
    const s = settled[idx]!;
    if (s.status === "rejected") throw s.reason;
    return s.value.tx;
  });
  return { txs };
};
