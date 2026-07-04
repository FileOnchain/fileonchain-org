import {
  createPublicClient,
  http,
  keccak256,
  stringToBytes,
  zeroHash,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import {
  buildChunkAnchorPayload,
  buildFileAnchorPayload,
  ChainNotProvisionedError,
  isValidCID,
  resolveFamilyChain,
  ZERO_ADDRESS,
  type AnchorChunk,
  type AnchorProgressHandler,
  type ChainConfig,
  type ChainId,
  type ChunkedAnchorReceipt,
} from "@fileonchain/utils";
import { fileRegistryAbi } from "./abis/fileRegistry";

/**
 * EVM client for the FileRegistry contract. Anchoring a folder is identical
 * to anchoring a file — pass the CID of the folder's DAG root.
 */

/** The bytes32 key FileRegistry stores a CID under: keccak256 of the CID string. */
export const cidToBytes32 = (cid: string): Hex => keccak256(stringToBytes(cid.trim()));

/**
 * Resolve an `evm:*` chain that has a deployed FileRegistry, or throw with a
 * message that says exactly what's missing.
 */
export const resolveEvmChain = (chainId: ChainId): ChainConfig & { registryContract: `0x${string}` } =>
  resolveFamilyChain(chainId, {
    family: "evm",
    familyLabel: "an EVM chain",
    assertProvisioned: (chain) => {
      if (!chain.registryContract || chain.registryContract === ZERO_ADDRESS) {
        throw new ChainNotProvisionedError(chainId, "FileRegistry is not deployed yet.");
      }
    },
  }) as ChainConfig & { registryContract: `0x${string}` };

/** Map a ChainConfig onto viem's `Chain` shape for client construction. */
export const toViemChain = (chain: ChainConfig): Chain => {
  if (chain.family !== "evm") throw new Error(`Chain "${chain.id}" is not an EVM chain.`);
  return {
    id: Number(chain.id.split(":")[1]),
    name: chain.name,
    nativeCurrency: {
      name: chain.nativeCurrency.symbol,
      symbol: chain.nativeCurrency.symbol,
      decimals: chain.nativeCurrency.decimals,
    },
    rpcUrls: { default: { http: [chain.rpcUrl] } },
    blockExplorers: { default: { name: chain.name, url: chain.explorerUrl } },
    testnet: chain.testnet,
  };
};

export interface AnchorCIDParams {
  /** An `evm:*` chain id with a deployed FileRegistry, e.g. "evm:8453". */
  chainId: ChainId;
  /** CIDv1 of the file, or of the folder's DAG root. */
  cid: string;
  /** SHA-256 of the raw content; defaults to the zero hash when unknown. */
  contentHash?: Hex;
  /** Optional IPFS / Arweave pointer stored alongside the anchor. */
  uri?: string;
}

/**
 * Anchor a CID on-chain via `FileRegistry.anchorCID`. The wallet client must
 * carry an account. Returns the transaction hash.
 */
export const anchorCID = async (
  walletClient: WalletClient,
  { chainId, cid, contentHash = zeroHash, uri = "" }: AnchorCIDParams
): Promise<Hex> => {
  if (!isValidCID(cid)) throw new Error(`"${cid}" is not a valid CIDv1 base32 string.`);
  const chain = resolveEvmChain(chainId);
  const account = walletClient.account;
  if (!account) throw new Error("The wallet client has no account to sign with.");
  return walletClient.writeContract({
    chain: toViemChain(chain),
    account,
    address: chain.registryContract,
    abi: fileRegistryAbi,
    functionName: "anchorCID",
    args: [cidToBytes32(cid), contentHash, uri],
  });
};

export interface EvmChunkedAnchorParams {
  /** An `evm:*` chain id with a deployed FileRegistry, e.g. "evm:8453". */
  chainId: ChainId;
  /** CIDv1 of the whole file. */
  fileCid: string;
  /** Chunks to anchor; `data` is ignored — EVM stores CIDs, not bytes. */
  chunks: AnchorChunk[];
  /** SHA-256 of the raw content on the file-level anchor; zero hash if unknown. */
  contentHash?: Hex;
  /** Optional IPFS / Arweave pointer on the file-level anchor. */
  uri?: string;
  /** Reused for the final receipt wait; created from the chain RPC otherwise. */
  publicClient?: PublicClient;
  onProgress?: AnchorProgressHandler;
}

/**
 * Anchor every chunk CID, then the file CID, as sequential
 * `FileRegistry.anchorCID` transactions. Each chunk's registry `uri` carries
 * the versioned chunk payload (linkage to the file and the next chunk); the
 * final file-level transaction is awaited to a receipt so the block number
 * is real. One wallet confirmation per transaction.
 */
export const anchorChunkedFile = async (
  walletClient: WalletClient,
  {
    chainId,
    fileCid,
    chunks,
    contentHash = zeroHash,
    uri = "",
    publicClient,
    onProgress,
  }: EvmChunkedAnchorParams
): Promise<ChunkedAnchorReceipt> => {
  if (!isValidCID(fileCid)) throw new Error(`"${fileCid}" is not a valid CIDv1 base32 string.`);
  const chain = resolveEvmChain(chainId);
  const account = walletClient.account;
  if (!account) throw new Error("The wallet client has no account to sign with.");

  const viemChain = toViemChain(chain);
  const total = chunks.length;
  const txHashes: string[] = [];

  const write = (cidHash: Hex, hash: Hex, payloadUri: string) =>
    walletClient.writeContract({
      chain: viemChain,
      account,
      address: chain.registryContract,
      abi: fileRegistryAbi,
      functionName: "anchorCID",
      args: [cidHash, hash, payloadUri],
    });

  for (const chunk of chunks) {
    onProgress?.({ stage: "signing", chunksAnchored: chunk.index, chunksTotal: total });
    const payload = buildChunkAnchorPayload({ fileCid, chunk, total });
    const txHash = await write(cidToBytes32(chunk.cid), zeroHash, payload);
    txHashes.push(txHash);
    onProgress?.({
      stage: "submitting",
      chunksAnchored: chunk.index + 1,
      chunksTotal: total,
      txHash,
    });
  }

  onProgress?.({ stage: "signing", chunksAnchored: total, chunksTotal: total });
  const fileUri = uri || buildFileAnchorPayload({ cid: fileCid });
  const fileTxHash = await write(cidToBytes32(fileCid), contentHash, fileUri);
  txHashes.push(fileTxHash);
  onProgress?.({ stage: "confirming", chunksAnchored: total, chunksTotal: total, txHash: fileTxHash });

  const client =
    publicClient ?? createPublicClient({ chain: viemChain, transport: http() });
  const receipt = await client.waitForTransactionReceipt({ hash: fileTxHash as Hex });

  onProgress?.({ stage: "confirmed", chunksAnchored: total, chunksTotal: total, txHash: fileTxHash });

  return {
    chainId: chain.id,
    txHashes,
    txHash: fileTxHash,
    blockNumber: Number(receipt.blockNumber),
    blockHash: receipt.blockHash,
    submitter: account.address,
  };
};

export interface EvmCIDRecord {
  contentHash: Hex;
  uri: string;
  blockNumber: bigint;
  timestamp: bigint;
  submitter: `0x${string}`;
}

/**
 * Read the FileRegistry record for a CID. Pass a `publicClient` to reuse an
 * existing connection; otherwise one is created from the chain's public RPC.
 * Returns null when the CID has never been anchored.
 */
export const getCIDRecord = async (
  chainId: ChainId,
  cid: string,
  publicClient?: PublicClient
): Promise<EvmCIDRecord | null> => {
  const chain = resolveEvmChain(chainId);
  const client =
    publicClient ?? createPublicClient({ chain: toViemChain(chain), transport: http() });
  const record = await client.readContract({
    address: chain.registryContract,
    abi: fileRegistryAbi,
    functionName: "getCIDRecord",
    args: [cidToBytes32(cid)],
  });
  if (record.timestamp === 0n) return null;
  return record;
};

/** Whether a CID is already anchored on the given chain. */
export const isCIDAnchored = async (
  chainId: ChainId,
  cid: string,
  publicClient?: PublicClient
): Promise<boolean> => (await getCIDRecord(chainId, cid, publicClient)) !== null;
