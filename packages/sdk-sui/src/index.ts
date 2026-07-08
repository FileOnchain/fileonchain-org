import {
  batchByCount,
  buildChunkAnchorPayload,
  buildFileAnchorPayload,
  ChainNotProvisionedError,
  resolveFamilyChain,
  type AnchorChunk,
  type AnchorProgressHandler,
  type BuildFileAnchorParams,
  type ChainConfig,
  type ChainId,
  type ChunkedAnchorReceipt,
} from "@fileonchain/utils";

/**
 * Sui client. Anchors call `<moduleAddress>::file_registry::anchor_cid(cid,
 * payload)` (contracts/sui) with the versioned JSON payloads from
 * `@fileonchain/utils`. Sui programmable transaction blocks let many move calls share
 * one transaction and one wallet approval, so the client batches all chunk
 * anchors plus the file anchor into as few PTBs as possible. Built against a
 * minimal signer surface so the SDK stays dependency-free — the caller
 * adapts @mysten/sui (server) or a wallet-standard wallet (browser).
 */

/** Module function every chunk anchor calls, namespaced under `moduleAddress`. */
export const ANCHOR_FUNCTION = "file_registry::anchor_cid" as const;

/** Module function the file-level anchor calls when propose-provisioned. */
export const PROPOSE_FUNCTION = "anchor_registry::propose_anchor" as const;

/** Sui system clock object, required by the time-windowed registry calls. */
export const SUI_CLOCK_OBJECT_ID = "0x6";

/** One `anchor_cid` move call: the CID being anchored and its payload. */
export interface SuiAnchorCall {
  cid: string;
  payload: string;
}

/**
 * One `propose_anchor` move call. The implementation must fund `payment`
 * with exactly `paymentAmount` FOC of `coinType` (split from the sender's
 * coins in the PTB — Sui has no allowances) and pass the shared registry
 * object plus the system clock (`SUI_CLOCK_OBJECT_ID`).
 */
export interface SuiProposeCall {
  /** `` `${moduleAddress}::${PROPOSE_FUNCTION}` `` */
  target: string;
  /** The shared AnchorRegistry object id (chain `registryContract`). */
  registryObjectId: string;
  /** FOC coin type: `` `${tokenContract}::foc::FOC` ``. */
  coinType: string;
  /** tip + propose bond, base units (stringified). */
  paymentAmount: string;
  cid: string;
  /** SHA-256 bytes of the raw content (empty when unknown). */
  contentHash: number[];
  uri: string;
  platformId: string;
  tip: string;
}

export interface SuiExecuteResult {
  digest: string;
  checkpoint?: number;
  /** Emitted events when the transport can surface them (RPC clients can;
   * wallet-standard browser wallets usually can't). */
  events?: Array<{ type: string; parsedJson?: unknown }>;
}

/**
 * The transport surface the client needs. `target` is
 * `` `${moduleAddress}::${ANCHOR_FUNCTION}` ``; implementations put each
 * call into one programmable transaction block and execute it.
 * `executeProposeCall` is optional — signers that support it unlock the
 * paid propose/verify path for file-level anchors.
 */
export interface SuiAnchorSigner {
  /** Account address paying for and signing the transactions. */
  address: string;
  executeAnchorCalls(
    target: string,
    calls: SuiAnchorCall[]
  ): Promise<{ digest: string; checkpoint?: number }>;
  executeProposeCall?(call: SuiProposeCall): Promise<SuiExecuteResult>;
}

/**
 * Resolve a `sui:*` chain with a deployed anchoring module, or throw with a
 * message that says exactly what's missing.
 */
export const resolveSuiChain = (
  chainId: ChainId
): ChainConfig & { moduleAddress: string } =>
  resolveFamilyChain(chainId, {
    family: "sui",
    familyLabel: "a Sui chain",
    assertProvisioned: (chain) => {
      if (!chain.moduleAddress) {
        throw new ChainNotProvisionedError(chainId, "the anchoring Move module is not deployed yet.");
      }
    },
  }) as ChainConfig & { moduleAddress: string };

/**
 * Resolve a `sui:*` chain where the propose/verify protocol is live —
 * `moduleAddress` (package), `tokenContract` (FOC package), and
 * `registryContract` (the shared AnchorRegistry object id) all set.
 */
export const resolveSuiProposeChain = (
  chainId: ChainId
): ChainConfig & { moduleAddress: string; tokenContract: string; registryContract: `0x${string}` } => {
  const chain = resolveSuiChain(chainId);
  if (!chain.tokenContract || !chain.registryContract) {
    throw new ChainNotProvisionedError(
      chainId,
      "the FOC token / AnchorRegistry shared object is not deployed yet."
    );
  }
  return chain as ChainConfig & {
    moduleAddress: string;
    tokenContract: string;
    registryContract: `0x${string}`;
  };
};

/** Read the shared registry's propose-side parameters via JSON-RPC. */
export const getProposeParams = async (
  chainId: ChainId
): Promise<{ minTip: bigint; proposeBond: bigint; challengeBond: bigint; challengeWindowMs: number }> => {
  const chain = resolveSuiProposeChain(chainId);
  const response = await fetch(chain.rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "sui_getObject",
      params: [chain.registryContract, { showContent: true }],
    }),
  });
  if (!response.ok) throw new Error(`Sui getObject failed: ${response.status}`);
  const json = (await response.json()) as {
    result?: { data?: { content?: { fields?: Record<string, string> } } };
  };
  const fields = json.result?.data?.content?.fields;
  if (!fields) throw new Error("AnchorRegistry object has no readable content.");
  return {
    minTip: BigInt(fields.min_tip ?? 0),
    proposeBond: BigInt(fields.propose_bond ?? 0),
    challengeBond: BigInt(fields.challenge_bond ?? 0),
    challengeWindowMs: Number(fields.challenge_window_ms ?? 0),
  };
};

/**
 * Sui caps PTB commands at 1024; 128 keeps transactions comfortably under
 * gas and size budgets.
 */
export const DEFAULT_MAX_CALLS_PER_TX = 128;

export interface SuiAnchorParams extends BuildFileAnchorParams {
  /** A `sui:*` chain id, e.g. "sui:mainnet". */
  chainId: ChainId;
  /** FOC tip in base units; defaults to the registry's on-chain min tip. */
  tip?: bigint;
}

/**
 * Anchor a single file-level CID: through
 * `anchor_registry::propose_anchor` (FOC tip + bond escrowed, optimistic
 * verification) when the chain is propose-provisioned and the signer
 * implements `executeProposeCall`, or as a plain one-call event PTB
 * otherwise.
 */
export const anchorCID = async (
  signer: SuiAnchorSigner,
  { chainId, tip, platformId = "1", ...payload }: SuiAnchorParams
): Promise<{ digest: string; payload: string }> => {
  const chain = resolveSuiChain(chainId);
  const serialized = buildFileAnchorPayload({ ...payload, platformId });
  if (chain.tokenContract && chain.registryContract && signer.executeProposeCall) {
    const proposeChain = resolveSuiProposeChain(chainId);
    const params = await getProposeParams(chainId);
    const effectiveTip = tip ?? params.minTip;
    const { digest } = await signer.executeProposeCall({
      target: `${proposeChain.moduleAddress}::${PROPOSE_FUNCTION}`,
      registryObjectId: proposeChain.registryContract,
      coinType: `${proposeChain.tokenContract}::foc::FOC`,
      paymentAmount: (effectiveTip + params.proposeBond).toString(),
      cid: payload.cid,
      contentHash: payload.sha256 ? hexToBytes(payload.sha256) : [],
      uri: payload.uri ?? serialized,
      platformId,
      tip: effectiveTip.toString(),
    });
    return { digest, payload: serialized };
  }
  const { digest } = await signer.executeAnchorCalls(
    `${chain.moduleAddress}::${ANCHOR_FUNCTION}`,
    [{ cid: payload.cid, payload: serialized }]
  );
  return { digest, payload: serialized };
};

export interface SuiChunkedAnchorParams {
  /** A `sui:*` chain id, e.g. "sui:mainnet". */
  chainId: ChainId;
  /** CIDv1 of the whole file. */
  fileCid: string;
  /** Chunks to anchor; `data` is ignored — the module stores CIDs, not bytes. */
  chunks: AnchorChunk[];
  /** Optional SHA-256 (hex) of the raw content, on the file-level anchor. */
  sha256?: string;
  /** Optional IPFS / Arweave pointer, on the file-level anchor. */
  uri?: string;
  /** Originating platform id; defaults to FileOnChain's platform 1. */
  platformId?: string;
  /** FOC tip in base units; defaults to the registry's on-chain min tip. */
  tip?: bigint;
  /** Override how many move calls share one PTB. */
  maxCallsPerTx?: number;
  onProgress?: AnchorProgressHandler;
}

const hexToBytes = (hex: string): number[] => {
  const clean = hex.replace(/^0x/, "");
  const bytes: number[] = [];
  for (let i = 0; i + 1 < clean.length; i += 2) bytes.push(parseInt(clean.slice(i, i + 2), 16));
  return bytes;
};

/**
 * Anchor every chunk as free `file_registry::anchor_cid` calls batched into
 * as few PTBs as possible, then the file CID — through
 * `anchor_registry::propose_anchor` (FOC tip + bond escrowed as an exact
 * coin split, optimistic verification) when the chain is propose-provisioned
 * and the signer implements `executeProposeCall`, or as a plain event anchor
 * otherwise.
 */
export const anchorChunkedFile = async (
  signer: SuiAnchorSigner,
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
  }: SuiChunkedAnchorParams
): Promise<ChunkedAnchorReceipt> => {
  const chain = resolveSuiChain(chainId);
  const target = `${chain.moduleAddress}::${ANCHOR_FUNCTION}`;
  const total = chunks.length;
  const proposePath = Boolean(
    chain.tokenContract && chain.registryContract && signer.executeProposeCall
  );

  const calls: SuiAnchorCall[] = chunks.map((chunk) => ({
    cid: chunk.cid,
    payload: buildChunkAnchorPayload({ fileCid, chunk, total }),
  }));
  if (!proposePath) {
    // Legacy event-only file anchor rides the last chunk batch.
    calls.push({
      cid: fileCid,
      payload: buildFileAnchorPayload({ cid: fileCid, sha256, uri, platformId }),
    });
  }

  const digests: string[] = [];
  let lastCheckpoint: number | undefined;
  let chunksAnchored = 0;

  for (const batch of batchByCount(calls, maxCallsPerTx)) {
    onProgress?.({ stage: "signing", chunksAnchored, chunksTotal: total });
    const { digest, checkpoint } = await signer.executeAnchorCalls(target, batch);
    digests.push(digest);
    lastCheckpoint = checkpoint ?? lastCheckpoint;
    // A trailing file-level call is not a chunk, so cap at the total.
    chunksAnchored = Math.min(chunksAnchored + batch.length, total);
    onProgress?.({ stage: "confirming", chunksAnchored, chunksTotal: total, txHash: digest });
  }

  let proposal: ChunkedAnchorReceipt["proposal"];
  if (proposePath) {
    const proposeChain = resolveSuiProposeChain(chainId);
    const params = await getProposeParams(chainId);
    const effectiveTip = tip ?? params.minTip;
    onProgress?.({ stage: "signing", chunksAnchored: total, chunksTotal: total });
    const result = await signer.executeProposeCall!({
      target: `${proposeChain.moduleAddress}::${PROPOSE_FUNCTION}`,
      registryObjectId: proposeChain.registryContract,
      coinType: `${proposeChain.tokenContract}::foc::FOC`,
      paymentAmount: (effectiveTip + params.proposeBond).toString(),
      cid: fileCid,
      contentHash: sha256 ? hexToBytes(sha256) : [],
      uri: uri ?? buildFileAnchorPayload({ cid: fileCid, sha256, platformId }),
      platformId,
      tip: effectiveTip.toString(),
    });
    digests.push(result.digest);
    lastCheckpoint = result.checkpoint ?? lastCheckpoint;
    const proposed = result.events?.find((event) => event.type.endsWith("::AnchorProposed"));
    const parsed = proposed?.parsedJson as
      | { proposal_id?: string; challenge_deadline?: string }
      | undefined;
    proposal = {
      proposalId: parsed?.proposal_id ?? "",
      platformId,
      tip: effectiveTip.toString(),
      bond: params.proposeBond.toString(),
      challengeDeadline: parsed?.challenge_deadline
        ? Math.floor(Number(parsed.challenge_deadline) / 1000)
        : Math.floor((Date.now() + params.challengeWindowMs) / 1000),
    };
  }

  onProgress?.({
    stage: "confirmed",
    chunksAnchored: total,
    chunksTotal: total,
    txHash: digests[digests.length - 1],
  });

  return {
    chainId: chain.id,
    txHashes: digests,
    txHash: digests[digests.length - 1],
    blockNumber: lastCheckpoint,
    submitter: signer.address,
    ...(proposal ? { proposal } : {}),
  };
};
