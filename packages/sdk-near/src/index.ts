import {
  buildChunkAnchorPayload,
  buildFileAnchorPayload,
  bytesToBase64,
  ChainNotProvisionedError,
  resolveFamilyChain,
  type AnchorChunk,
  type AnchorProgressHandler,
  type AnchorProposal,
  type BuildFileAnchorParams,
  type ChainConfig,
  type ChainId,
  type ChunkedAnchorReceipt,
  type ProposalStatus,
} from "@fileonchain/utils";

/**
 * NEAR client. Chunk anchors call the free event-only `anchor_cid(cid,
 * payload)` on the WASM registry contract (contracts/near), whose
 * **account id** lives in `moduleAddress` on the chain entry (e.g.
 * "registry.fileonchain.near"). File-level anchors go through the
 * propose/verify protocol when the FOC token is provisioned: NEAR has no
 * allowances, so a propose is one `ft_transfer_call` on the **token**
 * account carrying `tip + bond` and a JSON msg the registry's
 * `ft_on_transfer` routes. Built against a minimal signer surface so the
 * SDK stays dependency-free — the caller adapts near-api-js (server) or an
 * injected browser wallet to it; view reads use plain JSON-RPC.
 */

/** Contract method every chunk anchor calls on the registry account. */
export const ANCHOR_METHOD = "anchor_cid" as const;

/** Token method that initiates every paid registry action. */
export const PROPOSE_METHOD = "ft_transfer_call" as const;

/**
 * The transport surface the client needs. Implementations invoke
 * `anchor_cid` on `contractId` with the given arguments, and resolve once
 * the transaction is final. `callMethod` is optional — signers that provide
 * it unlock the paid propose/verify path (an `ft_transfer_call` on the FOC
 * token with 1 yoctoNEAR attached).
 */
export interface NearAnchorSigner {
  /** NEAR account id paying for and signing the transactions. */
  accountId: string;
  callAnchor(contractId: string, cid: string, payload: string): Promise<{ txHash: string; blockHeight?: number }>;
  callMethod?(
    contractId: string,
    method: string,
    args: Record<string, unknown>,
    options?: { attachedDeposit?: string; gas?: string }
  ): Promise<{ txHash: string; blockHeight?: number }>;
}

/**
 * Resolve a `near:*` chain with a deployed registry contract, or throw with
 * a message that says exactly what's missing.
 */
export const resolveNearChain = (
  chainId: ChainId
): ChainConfig & { moduleAddress: string } =>
  resolveFamilyChain(chainId, {
    family: "near",
    familyLabel: "a NEAR chain",
    assertProvisioned: (chain) => {
      if (!chain.moduleAddress) {
        throw new ChainNotProvisionedError(chainId, "the registry contract account is not deployed yet.");
      }
    },
  }) as ChainConfig & { moduleAddress: string };

/**
 * Resolve a `near:*` chain where the propose/verify protocol is live —
 * the registry account plus the FOC token account (`tokenContract`).
 */
export const resolveNearProposeChain = (
  chainId: ChainId
): ChainConfig & { moduleAddress: string; tokenContract: string } => {
  const chain = resolveNearChain(chainId);
  if (!chain.tokenContract) {
    throw new ChainNotProvisionedError(chainId, "the FOC token account is not deployed yet.");
  }
  return chain as ChainConfig & { moduleAddress: string; tokenContract: string };
};

/** Call a view method through plain NEAR JSON-RPC (`call_function`). */
const nearView = async <T>(
  chain: ChainConfig & { moduleAddress: string },
  method: string,
  args: Record<string, unknown>
): Promise<T> => {
  const response = await fetch(chain.rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "fileonchain",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: chain.moduleAddress,
        method_name: method,
        args_base64: bytesToBase64(new TextEncoder().encode(JSON.stringify(args))),
      },
    }),
  });
  if (!response.ok) throw new Error(`NEAR view ${method} failed: ${response.status}`);
  const json = (await response.json()) as {
    result?: { result?: number[] };
    error?: { message?: string };
  };
  if (!json.result?.result) {
    throw new Error(`NEAR view ${method} failed: ${json.error?.message ?? "no result"}`);
  }
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(json.result.result))) as T;
};

/** The registry's propose-side parameters (base units / seconds). */
export const getProposeParams = async (
  chainId: ChainId
): Promise<{ minTip: bigint; proposeBond: bigint; challengeBond: bigint; challengeWindowSeconds: number }> => {
  const chain = resolveNearProposeChain(chainId);
  const [minTip, proposeBond, challengeBond, windowSecs] = await nearView<
    [string, string, string, number]
  >(chain, "propose_params", {});
  return {
    minTip: BigInt(minTip),
    proposeBond: BigInt(proposeBond),
    challengeBond: BigInt(challengeBond),
    challengeWindowSeconds: Number(windowSecs),
  };
};

const NEAR_STATUSES: readonly ProposalStatus[] = [
  "none",
  "proposed",
  "challenged",
  "verified",
  "rejected",
];

/** Read a proposal by id; null when the id is unknown. */
export const getProposal = async (chainId: ChainId, proposalId: string): Promise<AnchorProposal | null> => {
  const chain = resolveNearProposeChain(chainId);
  const view = await nearView<{
    status: number;
    proposer: string;
    platform_id: number;
    tip: string;
    bond: string;
    challenge_deadline: number;
    verified_at: number;
  } | null>(chain, "get_proposal", { proposal_id: Number(proposalId) });
  if (!view) return null;
  return {
    proposalId,
    status: NEAR_STATUSES[view.status] ?? "none",
    proposer: view.proposer,
    platformId: String(view.platform_id),
    tip: view.tip,
    bond: view.bond,
    challengeDeadline: view.challenge_deadline,
    verifiedAt: view.verified_at,
  };
};

/**
 * Lifecycle status of a CID's latest proposal ("none" when the CID has no
 * proposal; a verified CID always reports "verified").
 */
export const getProposalStatus = async (chainId: ChainId, cid: string): Promise<ProposalStatus> => {
  const chain = resolveNearProposeChain(chainId);
  const verifiedId = await nearView<number>(chain, "verified_proposal_id", { cid });
  if (verifiedId !== 0) return "verified";
  const ids = await nearView<number[]>(chain, "proposal_ids_for_cid", { cid });
  if (!ids.length) return "none";
  const latest = await getProposal(chainId, String(ids[ids.length - 1]));
  return latest?.status ?? "none";
};

export interface NearAnchorParams extends BuildFileAnchorParams {
  /** A `near:*` chain id, e.g. "near:mainnet". */
  chainId: ChainId;
  /** FOC tip in base units; defaults to the registry's on-chain min tip. */
  tip?: bigint;
}

/** Gas for the ft_transfer_call round trip (token → registry → resolve). */
export const PROPOSE_GAS = "100000000000000";

/**
 * Propose a file-level anchor: one `ft_transfer_call` on the FOC token
 * carrying `tip + propose_bond` with the propose msg (1 yoctoNEAR
 * attached). The signer must implement `callMethod`.
 */
export const proposeAnchor = async (
  signer: NearAnchorSigner,
  { chainId, tip, platformId = "1", ...payload }: NearAnchorParams
): Promise<{ txHash: string; blockHeight?: number; tip: bigint; bond: bigint }> => {
  const chain = resolveNearProposeChain(chainId);
  if (!signer.callMethod) {
    throw new Error("This NEAR signer cannot send ft_transfer_call — implement callMethod.");
  }
  const params = await getProposeParams(chainId);
  const effectiveTip = tip ?? params.minTip;
  const msg = JSON.stringify({
    action: "propose",
    cid: payload.cid,
    content_hash: payload.sha256 ?? null,
    uri: payload.uri ?? buildFileAnchorPayload({ ...payload, platformId }),
    platform_id: Number(platformId),
    tip: effectiveTip.toString(),
  });
  const { txHash, blockHeight } = await signer.callMethod(
    chain.tokenContract,
    PROPOSE_METHOD,
    {
      receiver_id: chain.moduleAddress,
      amount: (effectiveTip + params.proposeBond).toString(),
      msg,
    },
    { attachedDeposit: "1", gas: PROPOSE_GAS }
  );
  return { txHash, blockHeight, tip: effectiveTip, bond: params.proposeBond };
};

/**
 * Anchor a single file-level CID: through the propose/verify protocol
 * (`ft_transfer_call` escrowing the FOC tip + bond) when the chain is
 * propose-provisioned and the signer implements `callMethod`, or as a
 * plain event anchor otherwise.
 */
export const anchorCID = async (
  signer: NearAnchorSigner,
  { chainId, tip, platformId = "1", ...payload }: NearAnchorParams
): Promise<{ txHash: string; payload: string }> => {
  const chain = resolveNearChain(chainId);
  const serialized = buildFileAnchorPayload({ ...payload, platformId });
  if (chain.tokenContract && signer.callMethod) {
    const { txHash } = await proposeAnchor(signer, { chainId, tip, platformId, ...payload });
    return { txHash, payload: serialized };
  }
  const { txHash } = await signer.callAnchor(chain.moduleAddress, payload.cid, serialized);
  return { txHash, payload: serialized };
};

export interface NearChunkedAnchorParams {
  /** A `near:*` chain id, e.g. "near:mainnet". */
  chainId: ChainId;
  /** CIDv1 of the whole file. */
  fileCid: string;
  /** Chunks to anchor; `data` is ignored — the contract stores CIDs, not bytes. */
  chunks: AnchorChunk[];
  /** Optional SHA-256 (hex) of the raw content, on the file-level anchor. */
  sha256?: string;
  /** Optional IPFS / Arweave pointer, on the file-level anchor. */
  uri?: string;
  /** Originating platform id; defaults to FileOnChain's platform 1. */
  platformId?: string;
  /** FOC tip in base units; defaults to the registry's on-chain min tip. */
  tip?: bigint;
  onProgress?: AnchorProgressHandler;
}

/**
 * Anchor every chunk as free `anchor_cid` contract calls, then the file CID
 * — through the propose/verify protocol (`ft_transfer_call` on the FOC
 * token escrowing tip + bond) when the chain is propose-provisioned and the
 * signer implements `callMethod`, or as a plain event anchor otherwise. One
 * wallet confirmation per transaction; the last one carries the file anchor.
 */
export const anchorChunkedFile = async (
  signer: NearAnchorSigner,
  { chainId, fileCid, chunks, sha256, uri, platformId = "1", tip, onProgress }: NearChunkedAnchorParams
): Promise<ChunkedAnchorReceipt> => {
  const chain = resolveNearChain(chainId);
  const total = chunks.length;
  const txHashes: string[] = [];
  let lastBlockHeight: number | undefined;

  for (const chunk of chunks) {
    onProgress?.({ stage: "signing", chunksAnchored: chunk.index, chunksTotal: total });
    const payload = buildChunkAnchorPayload({ fileCid, chunk, total });
    const { txHash, blockHeight } = await signer.callAnchor(chain.moduleAddress, chunk.cid, payload);
    txHashes.push(txHash);
    lastBlockHeight = blockHeight ?? lastBlockHeight;
    onProgress?.({
      stage: "submitting",
      chunksAnchored: chunk.index + 1,
      chunksTotal: total,
      txHash,
    });
  }

  onProgress?.({ stage: "signing", chunksAnchored: total, chunksTotal: total });
  let fileTxHash: string;
  let proposal: ChunkedAnchorReceipt["proposal"];
  if (chain.tokenContract && signer.callMethod) {
    const result = await proposeAnchor(signer, { chainId, cid: fileCid, sha256, uri, platformId, tip });
    fileTxHash = result.txHash;
    lastBlockHeight = result.blockHeight ?? lastBlockHeight;
    const windowSeconds = (await getProposeParams(chainId)).challengeWindowSeconds;
    proposal = {
      proposalId: "", // read back via proposal_ids_for_cid once indexed
      platformId,
      tip: result.tip.toString(),
      bond: result.bond.toString(),
      challengeDeadline: Math.floor(Date.now() / 1000) + windowSeconds,
    };
  } else {
    const filePayload = buildFileAnchorPayload({ cid: fileCid, sha256, uri, platformId });
    const fileResult = await signer.callAnchor(chain.moduleAddress, fileCid, filePayload);
    fileTxHash = fileResult.txHash;
    lastBlockHeight = fileResult.blockHeight ?? lastBlockHeight;
  }
  txHashes.push(fileTxHash);
  onProgress?.({ stage: "confirmed", chunksAnchored: total, chunksTotal: total, txHash: fileTxHash });

  return {
    chainId: chain.id,
    txHashes,
    txHash: fileTxHash,
    blockNumber: lastBlockHeight,
    submitter: signer.accountId,
    ...(proposal ? { proposal } : {}),
  };
};
