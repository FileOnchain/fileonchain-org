import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  type Connection,
} from "@solana/web3.js";
import {
  batchByBytes,
  buildChunkedAnchorPayloads,
  buildFileAnchorPayload,
  PartialAnchorError,
  resolveFamilyChain,
  utf8ByteLength,
  type AnchorChunk,
  type AnchorProgressHandler,
  type BuildFileAnchorParams,
  type ChainConfig,
  type ChainId,
  type ChunkedAnchorReceipt,
} from "@fileonchain/utils";

/**
 * Solana client. Anchors are SPL Memo instructions carrying the versioned
 * JSON payloads from `@fileonchain/utils` — the memo program is a native deployment
 * on every cluster, so no FileOnChain program is required. Several memos are
 * packed per transaction under the 1232-byte packet limit.
 */

/** The SPL Memo program — the same address on every Solana cluster. */
export const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

/**
 * The wallet surface the client needs — matched by Phantom, Solflare, and
 * any wallet-standard adapter exposing `signAndSendTransaction`.
 */
export interface SolanaAnchorSigner {
  publicKey: PublicKey;
  signAndSendTransaction(transaction: Transaction): Promise<{ signature: string }>;
}

/** Resolve a `solana:*` chain, or throw naming what's wrong. */
export const resolveSolanaChain = (chainId: ChainId): ChainConfig =>
  // Always provisioned — anchors ride the native SPL Memo program.
  resolveFamilyChain(chainId, { family: "solana", familyLabel: "a Solana chain" });

const memoInstruction = (payload: string): TransactionInstruction =>
  new TransactionInstruction({
    keys: [],
    programId: MEMO_PROGRAM_ID,
    // Uint8Array is accepted at runtime; the Buffer type is only nominal.
    data: new TextEncoder().encode(payload) as Buffer,
  });

const sendMemoTransaction = async (
  connection: Connection,
  signer: SolanaAnchorSigner,
  payloads: string[],
): Promise<{ signature: string; slot: number }> => {
  const latest = await connection.getLatestBlockhash();
  const transaction = new Transaction({
    feePayer: signer.publicKey,
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
  }).add(...payloads.map(memoInstruction));
  const { signature } = await signer.signAndSendTransaction(transaction);
  const confirmation = await connection.confirmTransaction(
    { signature, ...latest },
    "confirmed"
  );
  if (confirmation.value.err) {
    throw new Error(`Solana transaction failed: ${JSON.stringify(confirmation.value.err)}`);
  }
  return { signature, slot: confirmation.context.slot };
};

export interface SolanaAnchorParams extends BuildFileAnchorParams {
  /** A `solana:*` chain id, e.g. "solana:mainnet". */
  chainId: ChainId;
}

/** Anchor a single CID as one memo transaction. */
export const anchorCIDWithMemo = async (
  connection: Connection,
  signer: SolanaAnchorSigner,
  { chainId, ...payload }: SolanaAnchorParams
): Promise<{ signature: string; slot: number; memo: string }> => {
  resolveSolanaChain(chainId);
  const memo = buildFileAnchorPayload(payload);
  const { signature, slot } = await sendMemoTransaction(connection, signer, [memo]);
  return { signature, slot, memo };
};

export interface SolanaChunkedAnchorParams {
  /** A `solana:*` chain id, e.g. "solana:mainnet". */
  chainId: ChainId;
  /** CIDv1 of the whole file. */
  fileCid: string;
  /** Chunks to anchor; `data` is embedded (base64) when `includeData` asks
   * for on-chain storage — mind the tiny per-tx memo budget. */
  chunks: AnchorChunk[];
  /** Embed chunk bytes in the payloads (on-chain storage). Defaults to the
   * chain's `embedsChunkData` flag. */
  includeData?: boolean;
  /** Optional SHA-256 (hex) of the raw content, on the file-level anchor. */
  sha256?: string;
  /** Optional IPFS / Arweave pointer, on the file-level anchor. */
  uri?: string;
  /** Split into more transactions past this many memo bytes per tx. */
  maxMemoBytesPerTx?: number;
  /**
   * Skip batches a previous attempt of the identical request already
   * landed — pass the `failedIndex` of the PartialAnchorError it threw.
   * Batching is deterministic, so the index stays valid while the request
   * inputs (chunks, budgets, flags) are unchanged. The receipt covers only
   * the transactions this run sends.
   */
  resumeFrom?: number;
  onProgress?: AnchorProgressHandler;
}

/** Leaves headroom under the 1232-byte packet for signatures and keys. */
const DEFAULT_MAX_MEMO_BYTES_PER_TX = 700;

/**
 * Anchor every chunk plus the file-level anchor as memo instructions packed
 * into as few transactions as the packet size allows. One wallet
 * confirmation per transaction; the last one carries the file anchor.
 */
export const anchorChunkedFile = async (
  connection: Connection,
  signer: SolanaAnchorSigner,
  {
    chainId,
    fileCid,
    chunks,
    sha256,
    uri,
    includeData,
    maxMemoBytesPerTx = DEFAULT_MAX_MEMO_BYTES_PER_TX,
    resumeFrom,
    onProgress,
  }: SolanaChunkedAnchorParams
): Promise<ChunkedAnchorReceipt> => {
  const chain = resolveSolanaChain(chainId);
  const total = chunks.length;

  const embedData = includeData ?? chain.embedsChunkData ?? false;
  const payloads = buildChunkedAnchorPayloads({
    fileCid,
    chunks,
    sha256,
    uri,
    includeData: embedData,
  });
  const batches = batchByBytes(payloads, maxMemoBytesPerTx, utf8ByteLength);

  const txHashes: string[] = [];
  let lastSlot: number | undefined;
  let chunksAnchored = 0;
  // Clamp so a stale resume index can never skip the final batch (it
  // carries the file-level anchor).
  const startAt = Math.min(Math.max(Math.floor(resumeFrom ?? 0), 0), batches.length - 1);

  for (const [batchIndex, batch] of batches.entries()) {
    if (batchIndex < startAt) {
      // Landed in a previous attempt — still counts toward progress.
      chunksAnchored = Math.min(chunksAnchored + batch.length, total);
      continue;
    }
    onProgress?.({ stage: "signing", chunksAnchored, chunksTotal: total });
    let result: { signature: string; slot: number };
    try {
      result = await sendMemoTransaction(connection, signer, batch);
    } catch (error) {
      // Don't discard the transactions that already landed. `failedIndex`
      // stays absolute so it can seed the next attempt's `resumeFrom`.
      throw new PartialAnchorError(txHashes, txHashes.length, batchIndex, error);
    }
    const { signature, slot } = result;
    txHashes.push(signature);
    lastSlot = slot;
    chunksAnchored = Math.min(chunksAnchored + batch.length, total);
    onProgress?.({ stage: "confirming", chunksAnchored, chunksTotal: total, txHash: signature });
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
    blockNumber: lastSlot,
    submitter: signer.publicKey.toBase58(),
  };
};
