import {
  batchByCount,
  buildChunkAnchorPayload,
  buildFileAnchorPayload,
  ChainNotProvisionedError,
  resolveFamilyChain,
  ZERO_ADDRESS,
  type AnchorChunk,
  type AnchorProgressHandler,
  type BuildFileAnchorParams,
  type ChainConfig,
  type ChainId,
  type ChunkedAnchorReceipt,
} from "@fileonchain/utils";

/**
 * Starknet client. Anchors call `anchor_cid(cid: ByteArray, payload: ByteArray)`
 * on the Cairo FileRegistry (contracts/starknet), whose address lives in
 * `registryContract` on the chain entry. Starknet accounts execute multicalls
 * natively, so all chunk anchors plus the file anchor share as few
 * transactions (and wallet approvals) as possible. Built against a minimal
 * signer surface so the SDK stays dependency-free — the caller adapts
 * starknet.js (server) or an injected Argent/Braavos account (browser),
 * which also handle ByteArray calldata encoding.
 */

/** Contract entrypoint every chunk anchor calls on the FileRegistry. */
export const ANCHOR_ENTRYPOINT = "anchor_cid" as const;

/** AnchorRegistry entrypoint the file-level anchor calls when provisioned. */
export const PROPOSE_ENTRYPOINT = "propose_anchor" as const;

/** One `anchor_cid` call — the signer encodes both strings as ByteArrays. */
export interface StarknetAnchorCall {
  cid: string;
  payload: string;
}

/**
 * One propose flow: an ERC-20 `approve(anchorRegistry, approveAmount)` on
 * `tokenContract` plus `propose_anchor(cid, content_hash, uri, platform_id,
 * tip)` on `anchorRegistryContract`, executed as a SINGLE multicall — one
 * wallet signature covers both. The signer encodes ByteArrays and u256s.
 */
export interface StarknetProposeCall {
  tokenContract: string;
  anchorRegistryContract: string;
  /** tip + propose bond, FOC base units (stringified). */
  approveAmount: string;
  cid: string;
  /** SHA-256 of the raw content as 0x-hex (u256); "0x0" when unknown. */
  contentHash: string;
  uri: string;
  platformId: string;
  tip: string;
}

/**
 * The account surface the client needs. Implementations execute the calls as
 * one multicall transaction against `registryContract` and resolve once it
 * is accepted. `executeProposeCall` (approve + propose multicall) and
 * `callContract` (read-only starknet_call, used for on-chain parameter
 * reads) are optional — signers that provide them unlock the paid
 * propose/verify path for file-level anchors.
 */
export interface StarknetAnchorSigner {
  /** Account contract address paying for and signing the transactions. */
  address: string;
  executeAnchorCalls(
    registryContract: string,
    calls: StarknetAnchorCall[]
  ): Promise<{ transactionHash: string; blockNumber?: number }>;
  executeProposeCall?(
    call: StarknetProposeCall
  ): Promise<{ transactionHash: string; blockNumber?: number }>;
  callContract?(contractAddress: string, entrypoint: string, calldata: string[]): Promise<string[]>;
}

/**
 * Resolve a `starknet:*` chain with a deployed FileRegistry, or throw with a
 * message that says exactly what's missing.
 */
export const resolveStarknetChain = (
  chainId: ChainId
): ChainConfig & { registryContract: `0x${string}` } =>
  resolveFamilyChain(chainId, {
    family: "starknet",
    familyLabel: "a Starknet chain",
    assertProvisioned: (chain) => {
      if (!chain.registryContract || chain.registryContract === ZERO_ADDRESS) {
        throw new ChainNotProvisionedError(chainId, "the Cairo registry contract is not deployed yet.");
      }
    },
  }) as ChainConfig & { registryContract: `0x${string}` };

/**
 * Resolve a `starknet:*` chain where the propose/verify protocol is live.
 * On Starknet the AnchorRegistry contract carries proposals, staking, and
 * platforms in one deployment — its address lives in `stakingContract`
 * (`registryContract` stays the stateless chunk-anchor FileRegistry).
 */
export const resolveStarknetProposeChain = (
  chainId: ChainId
): ChainConfig & {
  registryContract: `0x${string}`;
  tokenContract: string;
  stakingContract: string;
} => {
  const chain = resolveStarknetChain(chainId);
  if (!chain.tokenContract || chain.tokenContract === ZERO_ADDRESS || !chain.stakingContract) {
    throw new ChainNotProvisionedError(
      chainId,
      "the FOC token / AnchorRegistry contract is not deployed yet."
    );
  }
  return chain as ChainConfig & {
    registryContract: `0x${string}`;
    tokenContract: string;
    stakingContract: string;
  };
};

const combineU256 = (low: string, high: string): bigint =>
  BigInt(low) + (BigInt(high) << 128n);

/**
 * The AnchorRegistry's propose-side parameters, read through the signer's
 * `callContract` (`propose_params` returns (min_tip, propose_bond,
 * challenge_bond, challenge_window_secs)).
 */
export const getProposeParams = async (
  chainId: ChainId,
  signer: Pick<StarknetAnchorSigner, "callContract">
): Promise<{ minTip: bigint; proposeBond: bigint; challengeBond: bigint; challengeWindowSeconds: number }> => {
  const chain = resolveStarknetProposeChain(chainId);
  if (!signer.callContract) {
    throw new Error("This Starknet signer cannot read contracts — pass an explicit tip instead.");
  }
  const result = await signer.callContract(chain.stakingContract, "propose_params", []);
  return {
    minTip: combineU256(result[0], result[1]),
    proposeBond: combineU256(result[2], result[3]),
    challengeBond: combineU256(result[4], result[5]),
    challengeWindowSeconds: Number(BigInt(result[6])),
  };
};

/**
 * Calls per multicall transaction — conservative enough to stay under the
 * sequencer's calldata and Cairo step limits with room for ByteArray
 * encoding overhead.
 */
export const DEFAULT_MAX_CALLS_PER_TX = 64;

export interface StarknetAnchorParams extends BuildFileAnchorParams {
  /** A `starknet:*` chain id, e.g. "starknet:mainnet". */
  chainId: ChainId;
  /** FOC tip in base units; defaults to the on-chain min tip (needs `callContract`). */
  tip?: bigint;
}

const canPropose = (chain: ChainConfig, signer: StarknetAnchorSigner): boolean =>
  Boolean(
    chain.tokenContract &&
      chain.tokenContract !== ZERO_ADDRESS &&
      chain.stakingContract &&
      signer.executeProposeCall
  );

/** Approve + propose as one multicall (single signature). */
const executePropose = async (
  signer: StarknetAnchorSigner,
  chainId: ChainId,
  params: { cid: string; sha256?: string; uri: string; platformId: string; tip?: bigint }
): Promise<{ transactionHash: string; blockNumber?: number; tip: bigint; bond: bigint }> => {
  const chain = resolveStarknetProposeChain(chainId);
  const onChain = await getProposeParams(chainId, signer);
  const tip = params.tip ?? onChain.minTip;
  const { transactionHash, blockNumber } = await signer.executeProposeCall!({
    tokenContract: chain.tokenContract,
    anchorRegistryContract: chain.stakingContract,
    approveAmount: (tip + onChain.proposeBond).toString(),
    cid: params.cid,
    contentHash: params.sha256 ? `0x${params.sha256.replace(/^0x/, "")}` : "0x0",
    uri: params.uri,
    platformId: params.platformId,
    tip: tip.toString(),
  });
  return { transactionHash, blockNumber, tip, bond: onChain.proposeBond };
};

/**
 * Anchor a single file-level CID: through the AnchorRegistry's
 * `propose_anchor` (approve + propose in one multicall; FOC tip + bond
 * escrowed, optimistic verification) when the chain is propose-provisioned
 * and the signer supports it, or as a plain event anchor otherwise.
 */
export const anchorCID = async (
  signer: StarknetAnchorSigner,
  { chainId, tip, platformId = "1", ...payload }: StarknetAnchorParams
): Promise<{ transactionHash: string; payload: string }> => {
  const chain = resolveStarknetChain(chainId);
  const serialized = buildFileAnchorPayload({ ...payload, platformId });
  if (canPropose(chain, signer)) {
    const { transactionHash } = await executePropose(signer, chainId, {
      cid: payload.cid,
      sha256: payload.sha256,
      uri: payload.uri ?? serialized,
      platformId,
      tip,
    });
    return { transactionHash, payload: serialized };
  }
  const { transactionHash } = await signer.executeAnchorCalls(chain.registryContract, [
    { cid: payload.cid, payload: serialized },
  ]);
  return { transactionHash, payload: serialized };
};

export interface StarknetChunkedAnchorParams {
  /** A `starknet:*` chain id, e.g. "starknet:mainnet". */
  chainId: ChainId;
  /** CIDv1 of the whole file. */
  fileCid: string;
  /** Chunks to anchor; `data` is ignored — the registry stores CIDs, not bytes. */
  chunks: AnchorChunk[];
  /** Optional SHA-256 (hex) of the raw content, on the file-level anchor. */
  sha256?: string;
  /** Optional IPFS / Arweave pointer, on the file-level anchor. */
  uri?: string;
  /** Originating platform id; defaults to FileOnChain's platform 1. */
  platformId?: string;
  /** FOC tip in base units; defaults to the on-chain min tip. */
  tip?: bigint;
  /** Override the calls-per-multicall budget. */
  maxCallsPerTx?: number;
  onProgress?: AnchorProgressHandler;
}

/**
 * Anchor every chunk as free `anchor_cid` multicalls of up to
 * `maxCallsPerTx` calls each, then the file CID — through the
 * AnchorRegistry's `propose_anchor` (approve + propose in ONE multicall, so
 * the paid path still costs a single extra signature) when the chain is
 * propose-provisioned and the signer supports it, or as a plain event
 * anchor riding the last chunk batch otherwise.
 */
export const anchorChunkedFile = async (
  signer: StarknetAnchorSigner,
  {
    chainId,
    fileCid,
    chunks,
    sha256,
    uri,
    platformId = "1",
    tip,
    maxCallsPerTx = DEFAULT_MAX_CALLS_PER_TX,
    onProgress,
  }: StarknetChunkedAnchorParams
): Promise<ChunkedAnchorReceipt> => {
  const chain = resolveStarknetChain(chainId);
  const total = chunks.length;
  const proposePath = canPropose(chain, signer);

  // Chunk anchors first, file anchor last — indexers see the file anchor
  // only after every chunk.
  const calls: StarknetAnchorCall[] = chunks.map((chunk) => ({
    cid: chunk.cid,
    payload: buildChunkAnchorPayload({ fileCid, chunk, total }),
  }));
  if (!proposePath) {
    calls.push({
      cid: fileCid,
      payload: buildFileAnchorPayload({ cid: fileCid, sha256, uri, platformId }),
    });
  }

  const txHashes: string[] = [];
  let lastBlockNumber: number | undefined;
  let chunksAnchored = 0;

  for (const batch of batchByCount(calls, maxCallsPerTx)) {
    onProgress?.({ stage: "signing", chunksAnchored, chunksTotal: total });
    const { transactionHash, blockNumber } = await signer.executeAnchorCalls(
      chain.registryContract,
      batch
    );
    txHashes.push(transactionHash);
    lastBlockNumber = blockNumber ?? lastBlockNumber;
    // A trailing file-level call is not a chunk, so cap the count at the total.
    chunksAnchored = Math.min(chunksAnchored + batch.length, total);
    onProgress?.({
      stage: "confirming",
      chunksAnchored,
      chunksTotal: total,
      txHash: transactionHash,
    });
  }

  let proposal: ChunkedAnchorReceipt["proposal"];
  if (proposePath) {
    onProgress?.({ stage: "signing", chunksAnchored: total, chunksTotal: total });
    const fileUri = uri || buildFileAnchorPayload({ cid: fileCid, sha256, platformId });
    const result = await executePropose(signer, chainId, {
      cid: fileCid,
      sha256,
      uri: fileUri,
      platformId,
      tip,
    });
    txHashes.push(result.transactionHash);
    lastBlockNumber = result.blockNumber ?? lastBlockNumber;
    const windowSeconds = (await getProposeParams(chainId, signer)).challengeWindowSeconds;
    proposal = {
      proposalId: "", // read back via proposal_id_for_cid once indexed
      platformId,
      tip: result.tip.toString(),
      bond: result.bond.toString(),
      challengeDeadline: Math.floor(Date.now() / 1000) + windowSeconds,
    };
  }

  onProgress?.({
    stage: "confirmed",
    chunksAnchored: total,
    chunksTotal: total,
    txHash: txHashes[txHashes.length - 1],
  });

  return {
    chainId: chain.id,
    txHashes,
    txHash: txHashes[txHashes.length - 1],
    blockNumber: lastBlockNumber,
    submitter: signer.address,
    ...(proposal ? { proposal } : {}),
  };
};
