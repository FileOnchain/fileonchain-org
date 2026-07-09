import {
  buildChunkAnchorPayload,
  buildFileAnchorPayload,
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
 * Aptos client. Chunk anchors call the free event-only
 * `<moduleAddress>::file_registry::anchor_cid` with the versioned JSON
 * payloads from `@fileonchain/utils`; the file-level anchor goes through
 * `<moduleAddress>::anchor_registry::propose_anchor` when the FOCAT token is
 * provisioned (`tokenContract` set on the chain entry), escrowing a tip +
 * bond that verify optimistically after the challenge window. Built against
 * the wallet-standard provider surface (Petra, Martian) plus the fullnode
 * REST API for view reads, so it needs no Aptos SDK dependency.
 */

/** Module function every chunk anchor calls, namespaced under `moduleAddress`. */
export const ANCHOR_FUNCTION = "file_registry::anchor_cid" as const;

/** Module function the file-level anchor calls when propose-provisioned. */
export const PROPOSE_FUNCTION = "anchor_registry::propose_anchor" as const;

export interface AptosEntryFunctionPayload {
  type: "entry_function_payload";
  function: string;
  type_arguments: string[];
  arguments: unknown[];
}

/**
 * The wallet surface the client needs — matched by Petra and Martian's
 * injected providers and by aptos-wallet-adapter.
 */
export interface AptosAnchorSigner {
  address: string;
  signAndSubmitTransaction(payload: AptosEntryFunctionPayload): Promise<{ hash: string }>;
}

/**
 * Resolve an `aptos:*` chain with a deployed anchoring module, or throw with
 * a message that says exactly what's missing.
 */
export const resolveAptosChain = (
  chainId: ChainId
): ChainConfig & { moduleAddress: string } =>
  resolveFamilyChain(chainId, {
    family: "aptos",
    familyLabel: "an Aptos chain",
    assertProvisioned: (chain) => {
      if (!chain.moduleAddress) {
        throw new ChainNotProvisionedError(chainId, "the anchoring Move module is not deployed yet.");
      }
    },
  }) as ChainConfig & { moduleAddress: string };

/**
 * Resolve an `aptos:*` chain where the propose/verify protocol is live —
 * a deployed module plus the FOCAT token that denominates tips and bonds.
 */
export const resolveAptosProposeChain = (
  chainId: ChainId
): ChainConfig & { moduleAddress: string; tokenContract: string } => {
  const chain = resolveAptosChain(chainId);
  if (!chain.tokenContract) {
    throw new ChainNotProvisionedError(chainId, "the FOCAT token is not deployed yet.");
  }
  return chain as ChainConfig & { moduleAddress: string; tokenContract: string };
};

const anchorPayload = (moduleAddress: string, cid: string, payload: string): AptosEntryFunctionPayload => ({
  type: "entry_function_payload",
  function: `${moduleAddress}::${ANCHOR_FUNCTION}`,
  type_arguments: [],
  arguments: [cid, payload],
});

/** Call a Move view function through the fullnode REST API (`<rpcUrl>/view`). */
const aptosView = async <T>(chain: ChainConfig, functionId: string, args: unknown[]): Promise<T> => {
  const response = await fetch(`${chain.rpcUrl.replace(/\/$/, "")}/view`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ function: functionId, type_arguments: [], arguments: args }),
  });
  if (!response.ok) {
    throw new Error(`Aptos view ${functionId} failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as T;
};

/** The registry's propose-side parameters (base units / seconds). */
export const getProposeParams = async (
  chainId: ChainId
): Promise<{ minTip: bigint; proposeBond: bigint; challengeBond: bigint; challengeWindowSeconds: number }> => {
  const chain = resolveAptosProposeChain(chainId);
  const [minTip, proposeBond, challengeBond, windowSecs] = await aptosView<[string, string, string, string]>(
    chain,
    `${chain.moduleAddress}::anchor_registry::propose_params`,
    []
  );
  return {
    minTip: BigInt(minTip),
    proposeBond: BigInt(proposeBond),
    challengeBond: BigInt(challengeBond),
    challengeWindowSeconds: Number(windowSecs),
  };
};

const APTOS_STATUSES: readonly ProposalStatus[] = [
  "none",
  "proposed",
  "challenged",
  "verified",
  "rejected",
];

/** Read a proposal by id; null when the id is unknown. */
export const getProposal = async (chainId: ChainId, proposalId: string): Promise<AnchorProposal | null> => {
  const chain = resolveAptosProposeChain(chainId);
  const [status, proposer, platformId, tip, bond, challengeDeadline, verifiedAt] = await aptosView<
    [number, string, string, string, string, string, string]
  >(chain, `${chain.moduleAddress}::anchor_registry::get_proposal`, [proposalId]);
  if (Number(status) === 0) return null;
  return {
    proposalId,
    status: APTOS_STATUSES[Number(status)] ?? "none",
    proposer,
    platformId: String(platformId),
    tip: String(tip),
    bond: String(bond),
    challengeDeadline: Number(challengeDeadline),
    verifiedAt: Number(verifiedAt),
  };
};

/**
 * Lifecycle status of a CID's latest proposal ("none" when the CID has no
 * proposal; a verified CID always reports "verified").
 */
export const getProposalStatus = async (chainId: ChainId, cid: string): Promise<ProposalStatus> => {
  const chain = resolveAptosProposeChain(chainId);
  const [verifiedId] = await aptosView<[string]>(
    chain,
    `${chain.moduleAddress}::anchor_registry::verified_proposal_id`,
    [cid]
  );
  if (BigInt(verifiedId) !== 0n) return "verified";
  const [ids] = await aptosView<[string[]]>(
    chain,
    `${chain.moduleAddress}::anchor_registry::proposal_ids_for_cid`,
    [cid]
  );
  if (!ids.length) return "none";
  const latest = await getProposal(chainId, ids[ids.length - 1]);
  return latest?.status ?? "none";
};

export interface AptosAnchorParams extends BuildFileAnchorParams {
  /** An `aptos:*` chain id, e.g. "aptos:mainnet". */
  chainId: ChainId;
  /** FOCAT tip in base units; defaults to the registry's on-chain min tip. */
  tip?: bigint;
}

/**
 * Anchor a single file-level CID: through `anchor_registry::propose_anchor`
 * (FOCAT tip + bond escrowed, optimistic verification) when the chain is
 * propose-provisioned, or as a plain `file_registry::anchor_cid` event
 * otherwise.
 */
export const anchorCID = async (
  signer: AptosAnchorSigner,
  { chainId, tip, ...payload }: AptosAnchorParams
): Promise<{ hash: string; payload: string }> => {
  const chain = resolveAptosChain(chainId);
  const serialized = buildFileAnchorPayload(payload);
  if (chain.tokenContract) {
    const { hash } = await proposeAnchor(signer, { chainId, tip, ...payload });
    return { hash, payload: serialized };
  }
  const { hash } = await signer.signAndSubmitTransaction(
    anchorPayload(chain.moduleAddress, payload.cid, serialized)
  );
  return { hash, payload: serialized };
};

export interface AptosProposeParams extends BuildFileAnchorParams {
  /** An `aptos:*` chain id, e.g. "aptos:mainnet". */
  chainId: ChainId;
  /** FOCAT tip in base units; defaults to the registry's on-chain min tip. */
  tip?: bigint;
}

/**
 * Propose a file-level anchor via `anchor_registry::propose_anchor`,
 * escrowing `tip + propose_bond` FOCAT from the signer. Returns the proposal
 * as read back from the registry (id, tip, bond, challenge deadline).
 */
export const proposeAnchor = async (
  signer: AptosAnchorSigner,
  { chainId, tip, platformId = "1", ...payload }: AptosProposeParams
): Promise<{ hash: string; proposal: AnchorProposal | null }> => {
  const chain = resolveAptosProposeChain(chainId);
  const effectiveTip = tip ?? (await getProposeParams(chainId)).minTip;
  const contentHash = payload.sha256 ? `0x${payload.sha256.replace(/^0x/, "")}` : "0x";
  const { hash } = await signer.signAndSubmitTransaction({
    type: "entry_function_payload",
    function: `${chain.moduleAddress}::${PROPOSE_FUNCTION}`,
    type_arguments: [],
    arguments: [
      payload.cid,
      contentHash,
      buildFileAnchorPayload({ ...payload, platformId }),
      platformId,
      effectiveTip.toString(),
    ],
  });
  // Read the proposal back: the signer's newest proposal for this CID.
  let proposal: AnchorProposal | null = null;
  try {
    const [ids] = await aptosView<[string[]]>(
      chain,
      `${chain.moduleAddress}::anchor_registry::proposal_ids_for_cid`,
      [payload.cid]
    );
    for (let i = ids.length - 1; i >= 0; i -= 1) {
      const candidate = await getProposal(chainId, ids[i]);
      if (candidate?.proposer === signer.address) {
        proposal = candidate;
        break;
      }
    }
  } catch {
    // Views are best-effort right after submission; the anchor itself landed.
  }
  return { hash, proposal };
};

export interface AptosChunkedAnchorParams {
  /** An `aptos:*` chain id, e.g. "aptos:mainnet". */
  chainId: ChainId;
  /** CIDv1 of the whole file. */
  fileCid: string;
  /** Chunks to anchor; `data` is embedded (base64) when `includeData` asks
   * for on-chain storage. */
  chunks: AnchorChunk[];
  /** Embed chunk bytes in the payloads (on-chain storage). Defaults to the
   * chain's `embedsChunkData` flag; mind the per-transaction byte budget. */
  includeData?: boolean;
  /** Optional SHA-256 (hex) of the raw content, on the file-level anchor. */
  sha256?: string;
  /** Optional IPFS / Arweave pointer, on the file-level anchor. */
  uri?: string;
  /** Originating platform id; defaults to FileOnChain's platform 1. */
  platformId?: string;
  /** FOCAT tip in base units; defaults to the registry's on-chain min tip. */
  tip?: bigint;
  onProgress?: AnchorProgressHandler;
}

/**
 * Anchor every chunk as a free `file_registry::anchor_cid` call, then the
 * file CID — through `anchor_registry::propose_anchor` (FOCAT tip + bond
 * escrowed, optimistic verification) when the chain is propose-provisioned,
 * or as a plain event anchor otherwise. One wallet confirmation per
 * transaction; the last one carries the file anchor.
 */
export const anchorChunkedFile = async (
  signer: AptosAnchorSigner,
  { chainId, fileCid, chunks, sha256, uri, includeData, platformId = "1", tip, onProgress }: AptosChunkedAnchorParams
): Promise<ChunkedAnchorReceipt> => {
  const chain = resolveAptosChain(chainId);
  const embedData = includeData ?? chain.embedsChunkData ?? false;
  const total = chunks.length;
  const txHashes: string[] = [];

  for (const chunk of chunks) {
    onProgress?.({ stage: "signing", chunksAnchored: chunk.index, chunksTotal: total });
    const payload = buildChunkAnchorPayload({ fileCid, chunk, total, includeData: embedData });
    const { hash } = await signer.signAndSubmitTransaction(
      anchorPayload(chain.moduleAddress, chunk.cid, payload)
    );
    txHashes.push(hash);
    onProgress?.({
      stage: "submitting",
      chunksAnchored: chunk.index + 1,
      chunksTotal: total,
      txHash: hash,
    });
  }

  onProgress?.({ stage: "signing", chunksAnchored: total, chunksTotal: total });
  let fileTxHash: string;
  let proposal: AnchorProposal | null = null;
  if (chain.tokenContract) {
    const result = await proposeAnchor(signer, { chainId, cid: fileCid, sha256, uri, platformId, tip });
    fileTxHash = result.hash;
    proposal = result.proposal;
  } else {
    const filePayload = buildFileAnchorPayload({ cid: fileCid, sha256, uri, platformId });
    ({ hash: fileTxHash } = await signer.signAndSubmitTransaction(
      anchorPayload(chain.moduleAddress, fileCid, filePayload)
    ));
  }
  txHashes.push(fileTxHash);
  onProgress?.({ stage: "confirmed", chunksAnchored: total, chunksTotal: total, txHash: fileTxHash });

  return {
    chainId: chain.id,
    txHashes,
    txHash: fileTxHash,
    submitter: signer.address,
    ...(proposal
      ? {
          proposal: {
            proposalId: proposal.proposalId,
            platformId: proposal.platformId,
            tip: proposal.tip,
            bond: proposal.bond,
            challengeDeadline: proposal.challengeDeadline,
          },
        }
      : {}),
  };
};
