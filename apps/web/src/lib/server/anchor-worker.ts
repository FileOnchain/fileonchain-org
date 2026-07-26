import "server-only";

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
 * Hosted anchoring is fail-closed: a requested chain must be provisioned and
 * its signer env vars must be configured. The browser upload flow has its own
 * simulated fallback for unprovisioned chains, but a hosted request never
 * receives a fabricated transaction hash.
 */

export class AnchorWorkerUnavailableError extends Error {
  constructor(
    readonly chainId: ChainId,
    message: string,
  ) {
    super(message);
    this.name = "AnchorWorkerUnavailableError";
  }
}

export class AnchorSignerUnavailableError extends AnchorWorkerUnavailableError {
  constructor(
    chainId: ChainId,
    readonly requiredEnv: readonly string[],
  ) {
    super(
      chainId,
      `Anchor signer not configured for ${chainId} — set ${requiredEnv.join(" and ")}`,
    );
    this.name = "AnchorSignerUnavailableError";
  }
}

export class AnchorChainUnavailableError extends AnchorWorkerUnavailableError {
  constructor(chainId: ChainId, reason: string) {
    super(chainId, `Chain ${chainId} ${reason}`);
    this.name = "AnchorChainUnavailableError";
  }
}

const missingSignerEnv = (
  ...entries: ReadonlyArray<readonly [name: string, value: string | undefined]>
): string[] => entries.flatMap(([name, value]) => (value ? [] : [name]));

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

type AnchorSend = () => Promise<UploadJobTx>;

/** Resolve signer material before any requested chain starts broadcasting. */
const createAnchorSend = (
  chain: ChainConfig,
  cid: string,
  platformId: string,
): AnchorSend => {
  switch (chain.family) {
    case "evm": {
      const privateKey = env.anchorEvmPrivateKey;
      if (!privateKey) {
        throw new AnchorSignerUnavailableError(chain.id, ["ANCHOR_EVM_PRIVATE_KEY"]);
      }
      return () => anchorOnEvm(chain, cid, privateKey, platformId);
    }
    case "substrate": {
      const seed = env.anchorSubstrateSeed;
      if (!seed) {
        throw new AnchorSignerUnavailableError(chain.id, ["ANCHOR_SUBSTRATE_SEED"]);
      }
      return () => anchorOnSubstrate(chain, cid, seed);
    }
    case "solana": {
      const secretKey = env.anchorSolanaSecretKey;
      if (!secretKey) {
        throw new AnchorSignerUnavailableError(chain.id, ["ANCHOR_SOLANA_SECRET_KEY"]);
      }
      return () => anchorOnSolana(chain, cid, secretKey);
    }
    case "aptos": {
      const privateKey = env.anchorAptosPrivateKey;
      if (!privateKey) {
        throw new AnchorSignerUnavailableError(chain.id, ["ANCHOR_APTOS_PRIVATE_KEY"]);
      }
      return () => anchorOnAptos(chain, cid, privateKey, platformId);
    }
    case "cosmos": {
      const mnemonic = env.anchorCosmosMnemonic;
      if (!mnemonic) {
        throw new AnchorSignerUnavailableError(chain.id, ["ANCHOR_COSMOS_MNEMONIC"]);
      }
      return async () => {
        const { anchorOnCosmos } = await import("./anchor-signers/cosmos");
        return await anchorOnCosmos(chain, cid, mnemonic);
      };
    }
    case "sui": {
      const privateKey = env.anchorSuiPrivateKey;
      if (!privateKey) {
        throw new AnchorSignerUnavailableError(chain.id, ["ANCHOR_SUI_PRIVATE_KEY"]);
      }
      return async () => {
        const { anchorOnSui } = await import("./anchor-signers/sui");
        return await anchorOnSui(chain, cid, privateKey);
      };
    }
    case "starknet": {
      const account = env.anchorStarknetAccount;
      const privateKey = env.anchorStarknetPrivateKey;
      const missing = missingSignerEnv(
        ["ANCHOR_STARKNET_ACCOUNT", account],
        ["ANCHOR_STARKNET_PRIVATE_KEY", privateKey],
      );
      if (missing.length > 0) {
        throw new AnchorSignerUnavailableError(chain.id, missing);
      }
      return async () => {
        const { anchorOnStarknet } = await import("./anchor-signers/starknet");
        return await anchorOnStarknet(chain, cid, account!, privateKey!);
      };
    }
    case "near": {
      const accountId = env.anchorNearAccountId;
      const privateKey = env.anchorNearPrivateKey;
      const missing = missingSignerEnv(
        ["ANCHOR_NEAR_ACCOUNT_ID", accountId],
        ["ANCHOR_NEAR_PRIVATE_KEY", privateKey],
      );
      if (missing.length > 0) {
        throw new AnchorSignerUnavailableError(chain.id, missing);
      }
      return async () => {
        const { anchorOnNear } = await import("./anchor-signers/near");
        return await anchorOnNear(chain, cid, accountId!, privateKey!);
      };
    }
    case "tron": {
      const privateKey = env.anchorTronPrivateKey;
      if (!privateKey) {
        throw new AnchorSignerUnavailableError(chain.id, ["ANCHOR_TRON_PRIVATE_KEY"]);
      }
      return async () => {
        const { anchorOnTron } = await import("./anchor-signers/tron");
        return await anchorOnTron(chain, cid, privateKey);
      };
    }
    case "cardano": {
      const signingKey = env.anchorCardanoSigningKey;
      const blockfrostKey = env.anchorCardanoBlockfrostKey;
      const missing = missingSignerEnv(
        ["ANCHOR_CARDANO_SIGNING_KEY", signingKey],
        ["ANCHOR_CARDANO_BLOCKFROST_KEY", blockfrostKey],
      );
      if (missing.length > 0) {
        throw new AnchorSignerUnavailableError(chain.id, missing);
      }
      // Cardano talks to Blockfrost via its project key, not chain.rpcUrl.
      return async () => {
        const { anchorOnCardano } = await import("./anchor-signers/cardano");
        return await anchorOnCardano(chain, cid, signingKey!, blockfrostKey!);
      };
    }
    case "ton": {
      const mnemonic = env.anchorTonMnemonic;
      const apiKey = env.anchorTonApiKey;
      if (!mnemonic) {
        throw new AnchorSignerUnavailableError(chain.id, ["ANCHOR_TON_MNEMONIC"]);
      }
      return async () => {
        const { anchorOnTon } = await import("./anchor-signers/ton");
        return await anchorOnTon(chain, cid, mnemonic!, apiKey);
      };
    }
    case "hedera": {
      const operatorId = env.anchorHederaOperatorId;
      const privateKey = env.anchorHederaPrivateKey;
      const missing = missingSignerEnv(
        ["ANCHOR_HEDERA_OPERATOR_ID", operatorId],
        ["ANCHOR_HEDERA_PRIVATE_KEY", privateKey],
      );
      if (missing.length > 0) {
        throw new AnchorSignerUnavailableError(chain.id, missing);
      }
      // Hedera uses the SDK network map, not chain.rpcUrl.
      return async () => {
        const { anchorOnHedera } = await import("./anchor-signers/hedera");
        return await anchorOnHedera(chain, cid, operatorId!, privateKey!);
      };
    }
  }
};

const resolveHostedChain = (
  chainId: ChainId,
  rpcOverrides: CustomRpcMap,
): ChainConfig => {
  const registryChain = getChain(chainId);
  if (!registryChain) {
    throw new AnchorChainUnavailableError(
      chainId,
      "is not registered for hosted anchoring",
    );
  }
  if (!isChainProvisioned(registryChain)) {
    throw new AnchorChainUnavailableError(
      chainId,
      "is not provisioned for hosted anchoring",
    );
  }

  // Provisioning is judged on the registry entry; only the endpoint we dial
  // changes. Re-check the stored URL (defense in depth — rows are validated
  // at write time) and ignore it rather than fail the job if it went bad.
  const overridden = withRpcOverride(registryChain, rpcOverrides);
  if (
    overridden !== registryChain &&
    validateRpcUrl(overridden.family, overridden.rpcUrl) !== null
  ) {
    return registryChain;
  }
  return overridden;
};

const runConfiguredSend = async (
  chainId: ChainId,
  send: AnchorSend,
): Promise<UploadJobTx> => {
  try {
    return await send();
  } catch (error) {
    if (error instanceof ChainNotProvisionedError) {
      throw new AnchorChainUnavailableError(
        chainId,
        "is not provisioned for hosted anchoring",
      );
    }
    throw error; // a configured signer failing is a real failure — surface it
  }
};

export interface AnchorWorkerResult {
  txs: UploadJobTx[];
}

export const runAnchorWorker = async (
  cid: string,
  chainIds: ChainId[],
  rpcOverrides: CustomRpcMap = {},
  platformId: string = env.anchorPlatformId,
): Promise<AnchorWorkerResult> => {
  if (chainIds.length === 0) return { txs: [] };

  // Resolve requested chain and signer configuration synchronously before
  // broadcasting any of them. This keeps a missing sibling signer from
  // creating an avoidable partial settlement. Configured sends are
  // independent — own RPC, signer, and nonce space — so fan them out and let
  // the slowest chain dictate the wall clock.
  const configured = chainIds.map((chainId) => {
    const chain = resolveHostedChain(chainId, rpcOverrides);
    return {
      chainId,
      send: createAnchorSend(chain, cid, platformId),
    };
  });
  const settled = await Promise.allSettled(
    configured.map(({ chainId, send }) => runConfiguredSend(chainId, send)),
  );
  const txs: UploadJobTx[] = chainIds.map((_, idx) => {
    const result = settled[idx]!;
    if (result.status === "rejected") throw result.reason;
    return result.value;
  });
  return { txs };
};
