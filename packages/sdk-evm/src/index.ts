import {
  createPublicClient,
  http,
  keccak256,
  parseEventLogs,
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
  type AnchorProposal,
  type ChainConfig,
  type ChainId,
  type ChunkedAnchorReceipt,
  type ProposalStatus,
} from "@fileonchain/utils";
import { fileRegistryAbi } from "./abis/fileRegistry";
import { fileOnChainTokenAbi } from "./abis/fileOnChainToken";
import { validatorStakingAbi } from "./abis/validatorStaking";

/**
 * EVM client for the FileRegistry anchor protocol. Anchoring a folder is
 * identical to anchoring a file — pass the CID of the folder's DAG root.
 *
 * Chunk anchors are free event-only `anchorChunk` transactions; the
 * file-level anchor is a paid `proposeAnchor` that escrows a FOCAT tip + bond,
 * opens a challenge window, and verifies optimistically (anyone can call
 * `finalize` once the window closes; disputes go to a staked-validator
 * jury). The tip splits between validators, the originating platform, and
 * the protocol treasury when the anchor verifies.
 */

/** The bytes32 key FileRegistry stores a CID under: keccak256 of the CID string. */
export const cidToBytes32 = (cid: string): Hex => keccak256(stringToBytes(cid.trim()));

/** Default platform id — FileOnChain itself (registered as platform 1 at deploy). */
export const DEFAULT_PLATFORM_ID = "1";

type ProvisionedEvmChain = ChainConfig & { registryContract: `0x${string}` };
type ProposeEvmChain = ProvisionedEvmChain & { tokenContract: `0x${string}` };

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

/**
 * Resolve an `evm:*` chain where the propose/verify protocol is live: a
 * deployed FileRegistry plus the FOCAT token that denominates tips and bonds.
 */
export const resolveEvmProposeChain = (chainId: ChainId): ProposeEvmChain => {
  const chain = resolveEvmChain(chainId);
  if (!chain.tokenContract || chain.tokenContract === ZERO_ADDRESS) {
    throw new ChainNotProvisionedError(chainId, "The FOCAT token is not deployed yet.");
  }
  return chain as ProposeEvmChain;
};

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

const PROPOSAL_STATUSES: readonly ProposalStatus[] = [
  "none",
  "proposed",
  "challenged",
  "verified",
  "rejected",
];

// ---------------------------------------------------------------------------
// Chunk anchoring (free, event-only)
// ---------------------------------------------------------------------------

export interface AnchorChunkTxParams {
  /** An `evm:*` chain id with a deployed FileRegistry, e.g. "evm:8453". */
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

// ---------------------------------------------------------------------------
// Propose / finalize / dispute
// ---------------------------------------------------------------------------

export interface ProposeAnchorParams {
  /** An `evm:*` chain id with the full protocol deployed, e.g. "evm:8453". */
  chainId: ChainId;
  /** CIDv1 of the file, or of the folder's DAG root. */
  cid: string;
  /** SHA-256 of the raw content; defaults to the zero hash when unknown. */
  contentHash?: Hex;
  /** Optional IPFS / Arweave pointer stored alongside the anchor. */
  uri?: string;
  /** Originating platform id; defaults to FileOnChain's platform 1. */
  platformId?: string;
  /** FOCAT tip in base units; defaults to the registry's on-chain `minTip`. */
  tip?: bigint;
  publicClient?: PublicClient;
  onProgress?: AnchorProgressHandler;
}

export interface ProposeAnchorReceipt {
  txHash: Hex;
  proposalId: string;
  platformId: string;
  /** Escrowed tip, FOCAT base units. */
  tip: bigint;
  /** Escrowed propose bond, FOCAT base units. */
  bond: bigint;
  /** Unix seconds when the challenge window closes. */
  challengeDeadline: number;
  blockNumber: number;
  blockHash: string;
}

/** Read the registry's escrow requirement and top up the allowance if short. */
const ensureRegistryAllowance = async (
  walletClient: WalletClient,
  chain: ProposeEvmChain,
  client: PublicClient,
  amount: bigint,
  onApproving?: () => void
): Promise<void> => {
  const account = requireAccount(walletClient);
  const allowance = await client.readContract({
    address: chain.tokenContract,
    abi: fileOnChainTokenAbi,
    functionName: "allowance",
    args: [account.address, chain.registryContract],
  });
  if (allowance >= amount) return;
  onApproving?.();
  const approveTx = await walletClient.writeContract({
    chain: toViemChain(chain),
    account,
    address: chain.tokenContract,
    abi: fileOnChainTokenAbi,
    functionName: "approve",
    args: [chain.registryContract, amount],
  });
  await client.waitForTransactionReceipt({ hash: approveTx });
};

/**
 * Propose a file-level anchor via `FileRegistry.proposeAnchor`, escrowing
 * `tip + proposeBond` FOCAT (an `approve` transaction is sent first when the
 * allowance is short). The proposal verifies after the challenge window
 * unless challenged; the receipt carries the window deadline.
 */
export const proposeAnchor = async (
  walletClient: WalletClient,
  {
    chainId,
    cid,
    contentHash = zeroHash,
    uri = "",
    platformId = DEFAULT_PLATFORM_ID,
    tip,
    publicClient,
    onProgress,
  }: ProposeAnchorParams
): Promise<ProposeAnchorReceipt> => {
  if (!isValidCID(cid)) throw new Error(`"${cid}" is not a valid CIDv1 base32 string.`);
  const chain = resolveEvmProposeChain(chainId);
  const account = requireAccount(walletClient);
  const client = publicClientFor(chain, publicClient);

  const [minTip, bond] = await Promise.all([
    client.readContract({
      address: chain.registryContract,
      abi: fileRegistryAbi,
      functionName: "minTip",
    }),
    client.readContract({
      address: chain.registryContract,
      abi: fileRegistryAbi,
      functionName: "proposeBond",
    }),
  ]);
  const effectiveTip = tip ?? minTip;

  await ensureRegistryAllowance(walletClient, chain, client, effectiveTip + bond, () =>
    onProgress?.({ stage: "approving", chunksAnchored: 0, chunksTotal: 0 })
  );

  onProgress?.({ stage: "signing", chunksAnchored: 0, chunksTotal: 0 });
  const txHash = await walletClient.writeContract({
    chain: toViemChain(chain),
    account,
    address: chain.registryContract,
    abi: fileRegistryAbi,
    functionName: "proposeAnchor",
    args: [cidToBytes32(cid), contentHash, uri, BigInt(platformId), effectiveTip],
  });
  onProgress?.({ stage: "confirming", chunksAnchored: 0, chunksTotal: 0, txHash });
  const receipt = await client.waitForTransactionReceipt({ hash: txHash });

  const [proposed] = parseEventLogs({
    abi: fileRegistryAbi,
    eventName: "AnchorProposed",
    logs: receipt.logs,
  });
  if (!proposed) throw new Error("proposeAnchor succeeded but no AnchorProposed event was emitted.");

  return {
    txHash,
    proposalId: proposed.args.proposalId.toString(),
    platformId: proposed.args.platformId.toString(),
    tip: proposed.args.tip,
    bond: proposed.args.bond,
    challengeDeadline: Number(proposed.args.challengeDeadline),
    blockNumber: Number(receipt.blockNumber),
    blockHash: receipt.blockHash,
  };
};

/** Finalize an unchallenged proposal after its challenge window (anyone may call). */
export const finalizeAnchor = async (
  walletClient: WalletClient,
  { chainId, proposalId }: { chainId: ChainId; proposalId: string }
): Promise<Hex> => {
  const chain = resolveEvmChain(chainId);
  const account = requireAccount(walletClient);
  return walletClient.writeContract({
    chain: toViemChain(chain),
    account,
    address: chain.registryContract,
    abi: fileRegistryAbi,
    functionName: "finalize",
    args: [BigInt(proposalId)],
  });
};

/**
 * Challenge a live proposal within its window, escrowing the challenger
 * bond (approved automatically when the allowance is short).
 */
export const challengeAnchor = async (
  walletClient: WalletClient,
  { chainId, proposalId, publicClient }: { chainId: ChainId; proposalId: string; publicClient?: PublicClient }
): Promise<Hex> => {
  const chain = resolveEvmProposeChain(chainId);
  const account = requireAccount(walletClient);
  const client = publicClientFor(chain, publicClient);
  const bond = await client.readContract({
    address: chain.registryContract,
    abi: fileRegistryAbi,
    functionName: "challengeBond",
  });
  await ensureRegistryAllowance(walletClient, chain, client, bond);
  return walletClient.writeContract({
    chain: toViemChain(chain),
    account,
    address: chain.registryContract,
    abi: fileRegistryAbi,
    functionName: "challenge",
    args: [BigInt(proposalId)],
  });
};

/** Cast a jury vote on a disputed proposal (jurors only). */
export const castVote = async (
  walletClient: WalletClient,
  { chainId, proposalId, upholdProposal }: { chainId: ChainId; proposalId: string; upholdProposal: boolean }
): Promise<Hex> => {
  const chain = resolveEvmChain(chainId);
  const account = requireAccount(walletClient);
  return walletClient.writeContract({
    chain: toViemChain(chain),
    account,
    address: chain.registryContract,
    abi: fileRegistryAbi,
    functionName: "castVote",
    args: [BigInt(proposalId), upholdProposal],
  });
};

/** Pull any FOCAT credited to the caller by the registry (fees, refunds, juror rewards). */
export const withdrawPayouts = async (
  walletClient: WalletClient,
  { chainId }: { chainId: ChainId }
): Promise<Hex> => {
  const chain = resolveEvmChain(chainId);
  const account = requireAccount(walletClient);
  return walletClient.writeContract({
    chain: toViemChain(chain),
    account,
    address: chain.registryContract,
    abi: fileRegistryAbi,
    functionName: "withdraw",
  });
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

type RawProposal = {
  cidHash: Hex;
  contentHash: Hex;
  uri: string;
  proposer: `0x${string}`;
  platformId: bigint;
  tip: bigint;
  bond: bigint;
  proposedAt: bigint | number;
  challengeDeadline: bigint | number;
  verifiedAt: bigint | number;
  status: number;
};

const toAnchorProposal = (proposalId: string, raw: RawProposal): AnchorProposal => ({
  proposalId,
  status: PROPOSAL_STATUSES[raw.status] ?? "none",
  proposer: raw.proposer,
  platformId: raw.platformId.toString(),
  tip: raw.tip.toString(),
  bond: raw.bond.toString(),
  challengeDeadline: Number(raw.challengeDeadline),
  verifiedAt: Number(raw.verifiedAt),
});

/** Read a proposal by id; null when the id is unknown. */
export const getProposal = async (
  chainId: ChainId,
  proposalId: string,
  publicClient?: PublicClient
): Promise<AnchorProposal | null> => {
  const chain = resolveEvmChain(chainId);
  const client = publicClientFor(chain, publicClient);
  const raw = (await client.readContract({
    address: chain.registryContract,
    abi: fileRegistryAbi,
    functionName: "getProposal",
    args: [BigInt(proposalId)],
  })) as RawProposal;
  if (raw.status === 0) return null;
  return toAnchorProposal(proposalId, raw);
};

/** Every proposal id ever opened for a CID, in propose order. */
export const getProposalIds = async (
  chainId: ChainId,
  cid: string,
  publicClient?: PublicClient
): Promise<string[]> => {
  const chain = resolveEvmChain(chainId);
  const client = publicClientFor(chain, publicClient);
  const ids = (await client.readContract({
    address: chain.registryContract,
    abi: fileRegistryAbi,
    functionName: "getProposalIds",
    args: [cidToBytes32(cid)],
  })) as readonly bigint[];
  return ids.map((id) => id.toString());
};

/** The verified record for a CID. */
export interface EvmCIDRecord {
  contentHash: Hex;
  uri: string;
  /** Unix seconds the anchor verified at. */
  timestamp: bigint;
  /** The proposer whose anchor verified. */
  submitter: `0x${string}`;
  /** Originating platform id. */
  platformId: string;
  /** The winning proposal's id. */
  proposalId: string;
}

/**
 * Read the verified anchor record for a CID ("first verified wins"). Returns
 * null while the CID has no verified proposal — including while a proposal
 * is still inside its challenge window.
 */
export const getVerifiedRecord = async (
  chainId: ChainId,
  cid: string,
  publicClient?: PublicClient
): Promise<EvmCIDRecord | null> => {
  const chain = resolveEvmChain(chainId);
  const client = publicClientFor(chain, publicClient);
  const cidHash = cidToBytes32(cid);
  const [raw, proposalId] = await Promise.all([
    client.readContract({
      address: chain.registryContract,
      abi: fileRegistryAbi,
      functionName: "getVerifiedRecord",
      args: [cidHash],
    }) as Promise<RawProposal>,
    client.readContract({
      address: chain.registryContract,
      abi: fileRegistryAbi,
      functionName: "verifiedProposalId",
      args: [cidHash],
    }),
  ]);
  if (raw.status !== 3) return null; // ProposalStatus.Verified
  return {
    contentHash: raw.contentHash,
    uri: raw.uri,
    timestamp: BigInt(raw.verifiedAt),
    submitter: raw.proposer,
    platformId: raw.platformId.toString(),
    proposalId: proposalId.toString(),
  };
};

/**
 * @deprecated The registry stores verified proposals now — use
 * `getVerifiedRecord`. Kept as an alias for existing callers.
 */
export const getCIDRecord = getVerifiedRecord;

/** Whether a CID has a verified anchor on the given chain. */
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
    functionName: "isCIDVerified",
    args: [cidToBytes32(cid)],
  });
};

// ---------------------------------------------------------------------------
// Token / staking helpers (SDK-level; no UI yet)
// ---------------------------------------------------------------------------

/** FOCAT balance of an address. */
export const getTokenBalance = async (
  chainId: ChainId,
  address: `0x${string}`,
  publicClient?: PublicClient
): Promise<bigint> => {
  const chain = resolveEvmProposeChain(chainId);
  const client = publicClientFor(chain, publicClient);
  return client.readContract({
    address: chain.tokenContract,
    abi: fileOnChainTokenAbi,
    functionName: "balanceOf",
    args: [address],
  });
};

/** Approve a spender (registry, staking, ...) for FOCAT. */
export const approveToken = async (
  walletClient: WalletClient,
  { chainId, spender, amount }: { chainId: ChainId; spender: `0x${string}`; amount: bigint }
): Promise<Hex> => {
  const chain = resolveEvmProposeChain(chainId);
  const account = requireAccount(walletClient);
  return walletClient.writeContract({
    chain: toViemChain(chain),
    account,
    address: chain.tokenContract,
    abi: fileOnChainTokenAbi,
    functionName: "approve",
    args: [spender, amount],
  });
};

const resolveStakingChain = (chainId: ChainId): ProposeEvmChain & { stakingContract: `0x${string}` } => {
  const chain = resolveEvmProposeChain(chainId);
  if (!chain.stakingContract || chain.stakingContract === ZERO_ADDRESS) {
    throw new ChainNotProvisionedError(chainId, "ValidatorStaking is not deployed yet.");
  }
  return chain as ProposeEvmChain & { stakingContract: `0x${string}` };
};

/** Stake FOCAT to join (or grow) the validator set. Requires prior approval. */
export const stake = async (
  walletClient: WalletClient,
  { chainId, amount }: { chainId: ChainId; amount: bigint }
): Promise<Hex> => {
  const chain = resolveStakingChain(chainId);
  const account = requireAccount(walletClient);
  return walletClient.writeContract({
    chain: toViemChain(chain),
    account,
    address: chain.stakingContract,
    abi: validatorStakingAbi,
    functionName: "stake",
    args: [amount],
  });
};

/** Start the unbonding cooldown for part or all of the caller's stake. */
export const requestUnstake = async (
  walletClient: WalletClient,
  { chainId, amount }: { chainId: ChainId; amount: bigint }
): Promise<Hex> => {
  const chain = resolveStakingChain(chainId);
  const account = requireAccount(walletClient);
  return walletClient.writeContract({
    chain: toViemChain(chain),
    account,
    address: chain.stakingContract,
    abi: validatorStakingAbi,
    functionName: "requestUnstake",
    args: [amount],
  });
};

/** Withdraw unbonded stake after the cooldown. */
export const withdrawUnstaked = async (
  walletClient: WalletClient,
  { chainId }: { chainId: ChainId }
): Promise<Hex> => {
  const chain = resolveStakingChain(chainId);
  const account = requireAccount(walletClient);
  return walletClient.writeContract({
    chain: toViemChain(chain),
    account,
    address: chain.stakingContract,
    abi: validatorStakingAbi,
    functionName: "withdrawUnstaked",
  });
};

/** Claim accumulated validator tip rewards. */
export const claimRewards = async (
  walletClient: WalletClient,
  { chainId }: { chainId: ChainId }
): Promise<Hex> => {
  const chain = resolveStakingChain(chainId);
  const account = requireAccount(walletClient);
  return walletClient.writeContract({
    chain: toViemChain(chain),
    account,
    address: chain.stakingContract,
    abi: validatorStakingAbi,
    functionName: "claimRewards",
  });
};

// ---------------------------------------------------------------------------
// Chunked file anchoring
// ---------------------------------------------------------------------------

export interface EvmChunkedAnchorParams {
  /** An `evm:*` chain id with the anchor protocol deployed, e.g. "evm:8453". */
  chainId: ChainId;
  /** CIDv1 of the whole file. */
  fileCid: string;
  /** Chunks to anchor; `data` is ignored — EVM stores CIDs, not bytes. */
  chunks: AnchorChunk[];
  /** SHA-256 of the raw content on the file-level anchor; zero hash if unknown. */
  contentHash?: Hex;
  /** Optional IPFS / Arweave pointer on the file-level anchor. */
  uri?: string;
  /** Originating platform id; defaults to FileOnChain's platform 1. */
  platformId?: string;
  /** FOCAT tip in base units; defaults to the registry's on-chain `minTip`. */
  tip?: bigint;
  /** Reused for reads and receipt waits; created from the chain RPC otherwise. */
  publicClient?: PublicClient;
  onProgress?: AnchorProgressHandler;
}

/**
 * Anchor every chunk CID as a free `anchorChunk` event, then propose the
 * file-level anchor via `proposeAnchor` (escrowing the FOCAT tip + bond, with
 * an automatic `approve` when the allowance is short). Each chunk's `uri`
 * carries the versioned chunk payload; the returned receipt includes the
 * proposal id and challenge-window deadline. One wallet confirmation per
 * transaction.
 */
export const anchorChunkedFile = async (
  walletClient: WalletClient,
  {
    chainId,
    fileCid,
    chunks,
    contentHash = zeroHash,
    uri = "",
    platformId = DEFAULT_PLATFORM_ID,
    tip,
    publicClient,
    onProgress,
  }: EvmChunkedAnchorParams
): Promise<ChunkedAnchorReceipt> => {
  if (!isValidCID(fileCid)) throw new Error(`"${fileCid}" is not a valid CIDv1 base32 string.`);
  const chain = resolveEvmProposeChain(chainId);
  const account = requireAccount(walletClient);

  const viemChain = toViemChain(chain);
  const client = publicClientFor(chain, publicClient);
  const total = chunks.length;
  const txHashes: string[] = [];

  for (const chunk of chunks) {
    onProgress?.({ stage: "signing", chunksAnchored: chunk.index, chunksTotal: total });
    const payload = buildChunkAnchorPayload({ fileCid, chunk, total });
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

  const fileUri = uri || buildFileAnchorPayload({ cid: fileCid, platformId });
  const proposal = await proposeAnchor(walletClient, {
    chainId,
    cid: fileCid,
    contentHash,
    uri: fileUri,
    platformId,
    tip,
    publicClient: client,
    onProgress: (progress) =>
      onProgress?.({ ...progress, chunksAnchored: total, chunksTotal: total }),
  });
  txHashes.push(proposal.txHash);

  onProgress?.({
    stage: "confirmed",
    chunksAnchored: total,
    chunksTotal: total,
    txHash: proposal.txHash,
  });

  return {
    chainId: chain.id,
    txHashes,
    txHash: proposal.txHash,
    blockNumber: proposal.blockNumber,
    blockHash: proposal.blockHash,
    submitter: account.address,
    proposal: {
      proposalId: proposal.proposalId,
      platformId: proposal.platformId,
      tip: proposal.tip.toString(),
      bond: proposal.bond.toString(),
      challengeDeadline: proposal.challengeDeadline,
    },
  };
};
