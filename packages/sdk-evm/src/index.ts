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
 * EVM client for the FileRegistry anchor registry. Anchoring a folder is
 * identical to anchoring a file — pass the CID of the folder's DAG root.
 *
 * The registry is an event carrier: every anchor writes the versioned
 * `fileonchain` payload through the free `anchorChunk` entrypoint, and the
 * payload's `op` field distinguishes chunk, file, and manifest anchors.
 * Anchoring costs nothing beyond gas — no token, no tips, no bonds. The
 * transaction receipt is the settlement receipt of the evidence package;
 * verification is off-chain and independent.
 *
 * Registries deployed from the anchor-only contract additionally expose
 * `anchorCID` with a first-write-wins stored record (`getCIDRecord` /
 * `isCIDAnchored`); the write path here deliberately targets the event
 * entrypoint, which every deployed registry generation supports.
 */

/** The bytes32 key FileRegistry stores a CID under: keccak256 of the CID string. */
export const cidToBytes32 = (cid: string): Hex => keccak256(stringToBytes(cid.trim()));

/** Default platform id — pure payload attribution (FileOnChain = "1"). */
export const DEFAULT_PLATFORM_ID = "1";

type ProvisionedEvmChain = ChainConfig & { registryContract: `0x${string}` };

/**
 * Resolve an `evm:*` chain that has a deployed FileRegistry, or throw with a
 * message that says exactly what's missing.
 */
export const resolveEvmChain = (chainId: ChainId): ProvisionedEvmChain =>
  resolveFamilyChain(chainId, {
    family: "evm",
    familyLabel: "an EVM chain",
    assertProvisioned: (chain) => {
      if (!chain.registryContract || chain.registryContract === ZERO_ADDRESS) {
        throw new ChainNotProvisionedError(chainId, "FileRegistry is not deployed yet.");
      }
    },
  }) as ProvisionedEvmChain;

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

const publicClientFor = (chain: ChainConfig, existing?: PublicClient): PublicClient =>
  existing ?? createPublicClient({ chain: toViemChain(chain), transport: http() });

const requireAccount = (walletClient: WalletClient) => {
  const account = walletClient.account;
  if (!account) throw new Error("The wallet client has no account to sign with.");
  return account;
};

// ---------------------------------------------------------------------------
// Anchoring (free, event-only)
// ---------------------------------------------------------------------------

export interface AnchorChunkTxParams {
  /** An `evm:*` chain id with a deployed FileRegistry, e.g. "evm:11155111". */
  chainId: ChainId;
  /** CIDv1 of the chunk (or any CID to anchor as an event). */
  cid: string;
  /** SHA-256 of the raw content; defaults to the zero hash when unknown. */
  contentHash?: Hex;
  /** Payload / pointer stored in the event `uri`. */
  uri?: string;
}

/**
 * Emit a free `FileRegistry.anchorChunk` event for a CID. No storage, no
 * fees — chunk linkage lives in the anchor payload carried as `uri`.
 */
export const anchorChunk = async (
  walletClient: WalletClient,
  { chainId, cid, contentHash = zeroHash, uri = "" }: AnchorChunkTxParams
): Promise<Hex> => {
  if (!isValidCID(cid)) throw new Error(`"${cid}" is not a valid CIDv1 base32 string.`);
  const chain = resolveEvmChain(chainId);
  const account = requireAccount(walletClient);
  return walletClient.writeContract({
    chain: toViemChain(chain),
    account,
    address: chain.registryContract,
    abi: fileRegistryAbi,
    functionName: "anchorChunk",
    args: [cidToBytes32(cid), contentHash, uri],
  });
};

export interface AnchorCIDParams {
  /** An `evm:*` chain id with a deployed FileRegistry, e.g. "evm:11155111". */
  chainId: ChainId;
  /** CIDv1 of the file, or of the folder's DAG root. */
  cid: string;
  /** SHA-256 of the raw content; defaults to the zero hash when unknown. */
  contentHash?: Hex;
  /** Payload / pointer for the anchor; defaults to the file anchor payload. */
  uri?: string;
  /** Originating platform id carried in the payload (attribution only). */
  platformId?: string;
  /** Reused for receipt waits; created from the chain RPC otherwise. */
  publicClient?: PublicClient;
  onProgress?: AnchorProgressHandler;
}

export interface AnchorCIDReceipt {
  txHash: Hex;
  blockNumber: number;
  blockHash: string;
  /** Address that signed the anchoring transaction. */
  submitter: `0x${string}`;
}

/**
 * Anchor a file-level CID and wait for inclusion. The transaction writes
 * the versioned file anchor payload as a registry event; the returned
 * receipt is what an evidence package records as its settlement receipt.
 */
export const anchorCID = async (
  walletClient: WalletClient,
  {
    chainId,
    cid,
    contentHash = zeroHash,
    uri = "",
    platformId = DEFAULT_PLATFORM_ID,
    publicClient,
    onProgress,
  }: AnchorCIDParams
): Promise<AnchorCIDReceipt> => {
  if (!isValidCID(cid)) throw new Error(`"${cid}" is not a valid CIDv1 base32 string.`);
  const chain = resolveEvmChain(chainId);
  const account = requireAccount(walletClient);
  const client = publicClientFor(chain, publicClient);
  const payload = uri || buildFileAnchorPayload({ cid, platformId });

  onProgress?.({ stage: "signing", chunksAnchored: 0, chunksTotal: 0 });
  const txHash = await walletClient.writeContract({
    chain: toViemChain(chain),
    account,
    address: chain.registryContract,
    abi: fileRegistryAbi,
    functionName: "anchorChunk",
    args: [cidToBytes32(cid), contentHash, payload],
  });
  onProgress?.({ stage: "confirming", chunksAnchored: 0, chunksTotal: 0, txHash });
  const receipt = await client.waitForTransactionReceipt({ hash: txHash });

  return {
    txHash,
    blockNumber: Number(receipt.blockNumber),
    blockHash: receipt.blockHash,
    submitter: account.address,
  };
};

// ---------------------------------------------------------------------------
// Reads (anchor-only registry deployments)
// ---------------------------------------------------------------------------

/** The stored first-write record for a CID. */
export interface EvmCIDRecord {
  contentHash: Hex;
  uri: string;
  /** Unix seconds of the first anchor. */
  timestamp: bigint;
  /** Address that first anchored the CID. */
  submitter: `0x${string}`;
}

/**
 * Read the first-write record stored by `FileRegistry.anchorCID`. Returns
 * null when the CID was never anchored through the record path. Requires a
 * registry deployed from the anchor-only contract; event-only anchors are
 * discovered through an indexer instead.
 */
export const getCIDRecord = async (
  chainId: ChainId,
  cid: string,
  publicClient?: PublicClient
): Promise<EvmCIDRecord | null> => {
  const chain = resolveEvmChain(chainId);
  const client = publicClientFor(chain, publicClient);
  const raw = (await client.readContract({
    address: chain.registryContract,
    abi: fileRegistryAbi,
    functionName: "getCIDRecord",
    args: [cidToBytes32(cid)],
  })) as { contentHash: Hex; uri: string; timestamp: bigint | number; submitter: `0x${string}` };
  if (Number(raw.timestamp) === 0) return null;
  return {
    contentHash: raw.contentHash,
    uri: raw.uri,
    timestamp: BigInt(raw.timestamp),
    submitter: raw.submitter,
  };
};

/** Whether a CID has a stored record (see `getCIDRecord`'s deployment caveat). */
export const isCIDAnchored = async (
  chainId: ChainId,
  cid: string,
  publicClient?: PublicClient
): Promise<boolean> => {
  const chain = resolveEvmChain(chainId);
  const client = publicClientFor(chain, publicClient);
  return client.readContract({
    address: chain.registryContract,
    abi: fileRegistryAbi,
    functionName: "isCIDAnchored",
    args: [cidToBytes32(cid)],
  });
};

// ---------------------------------------------------------------------------
// Chunked file anchoring
// ---------------------------------------------------------------------------

export interface EvmChunkedAnchorParams {
  /** An `evm:*` chain id with a deployed FileRegistry, e.g. "evm:11155111". */
  chainId: ChainId;
  /** CIDv1 of the whole file. */
  fileCid: string;
  /** Chunks to anchor; `data` is embedded (base64) when `includeData` asks
   * for on-chain storage. */
  chunks: AnchorChunk[];
  /** Embed chunk bytes in the payloads (on-chain storage). Defaults to the
   * chain's `embedsChunkData` flag; bytes ride the event `uri` calldata. */
  includeData?: boolean;
  /** SHA-256 of the raw content on the file-level anchor; zero hash if unknown. */
  contentHash?: Hex;
  /** Optional storage/external pointer on the file-level anchor. */
  uri?: string;
  /** Originating platform id carried in the payload (attribution only). */
  platformId?: string;
  /** Reused for receipt waits; created from the chain RPC otherwise. */
  publicClient?: PublicClient;
  onProgress?: AnchorProgressHandler;
}

/**
 * Anchor every chunk CID as a free `anchorChunk` event, then anchor the
 * file-level CID last (indexers rely on chunks-first ordering). One wallet
 * confirmation per transaction; the file anchor's receipt is waited on so
 * the returned block data can go straight into an evidence package.
 */
export const anchorChunkedFile = async (
  walletClient: WalletClient,
  {
    chainId,
    fileCid,
    chunks,
    contentHash = zeroHash,
    uri = "",
    includeData,
    platformId = DEFAULT_PLATFORM_ID,
    publicClient,
    onProgress,
  }: EvmChunkedAnchorParams
): Promise<ChunkedAnchorReceipt> => {
  if (!isValidCID(fileCid)) throw new Error(`"${fileCid}" is not a valid CIDv1 base32 string.`);
  const chain = resolveEvmChain(chainId);
  const embedData = includeData ?? chain.embedsChunkData ?? false;
  const account = requireAccount(walletClient);

  const viemChain = toViemChain(chain);
  const client = publicClientFor(chain, publicClient);
  const total = chunks.length;
  const txHashes: string[] = [];

  for (const chunk of chunks) {
    onProgress?.({ stage: "signing", chunksAnchored: chunk.index, chunksTotal: total });
    const payload = buildChunkAnchorPayload({ fileCid, chunk, total, includeData: embedData });
    const txHash = await walletClient.writeContract({
      chain: viemChain,
      account,
      address: chain.registryContract,
      abi: fileRegistryAbi,
      functionName: "anchorChunk",
      args: [cidToBytes32(chunk.cid), zeroHash, payload],
    });
    txHashes.push(txHash);
    onProgress?.({
      stage: "submitting",
      chunksAnchored: chunk.index + 1,
      chunksTotal: total,
      txHash,
    });
  }

  const fileAnchor = await anchorCID(walletClient, {
    chainId,
    cid: fileCid,
    contentHash,
    uri,
    platformId,
    publicClient: client,
    onProgress: (progress) =>
      onProgress?.({ ...progress, chunksAnchored: total, chunksTotal: total }),
  });
  txHashes.push(fileAnchor.txHash);

  onProgress?.({
    stage: "confirmed",
    chunksAnchored: total,
    chunksTotal: total,
    txHash: fileAnchor.txHash,
  });

  return {
    chainId: chain.id,
    txHashes,
    txHash: fileAnchor.txHash,
    blockNumber: fileAnchor.blockNumber,
    blockHash: fileAnchor.blockHash,
    submitter: account.address,
  };
};
