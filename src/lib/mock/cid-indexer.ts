import { CHAINS, getChain } from "@/lib/chains/registry";
import type { ChainId } from "@/types/types";
import type { ChainFamily } from "@/types/types";

/* TODO: wire to The Graph / Goldsky / Subscan / Solana RPC / Aptos indexer */

export type AnchorStatus = "anchored" | "pending" | "missing";
export type FileCategory = "document" | "image" | "video" | "audio" | "data" | "code" | "archive" | "other";

export interface SearchHit {
  chainId: ChainId;
  chainName: string;
  chainShortName: string;
  family: ChainFamily;
  /** Block explorer tx hash for the registry call. */
  txHash: string;
  blockNumber: number;
  /** Unix timestamp in seconds. */
  timestamp: number;
  status: AnchorStatus;
  /** Optional — only set when the hit represents a single chunk anchor. */
  chunkIndex?: number;
  /** Address that submitted the anchor tx. */
  submitter: string;
  /** Registry contract address on the chain family. */
  registryAddress: string | null;
}

/* ----------------------------------------------------------------------------
 * File metadata — surfaced in the explorer so users can tell what kind of
 * payload a CID actually represents without having to download it. The list
 * below is mock content so the explorer has something to display before a
 * real indexer is wired.
 * --------------------------------------------------------------------------- */

export interface RegisteredFile {
  cid: string;
  /** Public display name. */
  name: string;
  /** MIME type — drives the explorer icon. */
  mimeType: string;
  /** Byte size of the original file. */
  sizeBytes: number;
  /** Number of chunks the file was split into. */
  chunkCount: number;
  /** Coarse category bucket for grouping in the explorer UI. */
  category: FileCategory;
  /** Short human description (mock content). */
  description: string;
  /** Submitter address (deterministic from CID). */
  uploader: string;
}

const MOCK_FILES: RegisteredFile[] = [
  {
    cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    name: "whitepaper-v3.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1_482_910,
    chunkCount: 23,
    category: "document",
    description: "FileOnChain protocol whitepaper, v3.0 — covers chunking scheme, registry ABI, and cache layer.",
    uploader: "0x9af4cA2E7d9B61f5b9d6E3F4d8C5B2a1F0e9D8c7B",
  },
  {
    cid: "bafybeibv3zaicqsdwfmq5dym6ipxzl5qxksirv3d3uyzjqhs2dtx3w3c3q",
    name: "genesis-snapshot.json",
    mimeType: "application/json",
    sizeBytes: 4_812_443,
    chunkCount: 76,
    category: "data",
    description: "Genesis block snapshot for the cache payment contract — 76 chunks, SHA-256 chained.",
    uploader: "0x44cA2b1d5BfE63d8C2F3aE9d10A7c8B6E5f4D3C2B",
  },
  {
    cid: "bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku",
    name: "launch-trailer.mp4",
    mimeType: "video/mp4",
    sizeBytes: 184_220_012,
    chunkCount: 2813,
    category: "video",
    description: "Launch trailer — 4K, 60s. Splits into ~2.8K chunks before tx payload limits kick in.",
    uploader: "0x71fD3e2c1A0B9d8e7F6c5B4a3D2c1E0fA9b8C7d6",
  },
  {
    cid: "bafybeif2p5yvxkblz6vquj4qfq5dym6ipxzl5qxksirv3d3uyzjqhs2dtz",
    name: "treasury-report-q3.pdf",
    mimeType: "application/pdf",
    sizeBytes: 624_881,
    chunkCount: 10,
    category: "document",
    description: "Treasury report covering Q3 — DAO expenses, cache node operator payouts, donation flow.",
    uploader: "0x83318bCcE7F02Ead5C3dE5f4A1b9C7d6E5f4A3b2C",
  },
  {
    cid: "bafybeic5vdqqvkqxgkxq5dym6ipxzl5qxksirv3d3uyzjqhs2dtxt4zabc",
    name: "staking-pool.bin",
    mimeType: "application/octet-stream",
    sizeBytes: 12_400,
    chunkCount: 1,
    category: "data",
    description: "Single-chunk binary used to verify the small-file fast path through the registry.",
    uploader: "0x53318bCcE7F02Ead5C3dE5f4A1b9C7d6E5f4A3b2C",
  },
  {
    cid: "bafybeih73xzvp4w5dym6ipxzl5qxksirv3d3uyzjqhs2dtxtrrtr7xsdef",
    name: "logo-crest.png",
    mimeType: "image/png",
    sizeBytes: 18_440,
    chunkCount: 1,
    category: "image",
    description: "Project logo — single-chunk image, used to verify PNG integrity on retrieval.",
    uploader: "0xaA91Fd42E0C2aBe7F02Ead5C3dE5f4A1b9C7d6E5f4",
  },
  {
    cid: "bafybeig4sh5vwifi6e2kqxgkxq5dym6ipxzl5qxksirv3d3uyzjqhs2xyz",
    name: "research-notes.md",
    mimeType: "text/markdown",
    sizeBytes: 84_120,
    chunkCount: 2,
    category: "document",
    description: "Engineering research notes on DAG encoding strategies — markdown source, freely redistributable.",
    uploader: "0x44cA2b1d5BfE63d8C2F3aE9d10A7c8B6E5f4D3C2B",
  },
  {
    cid: "bafybeibzvs5wvx7g42gqxgkxq5dym6ipxzl5qxksirv3d3uyzjqhs2ghi9",
    name: "validator-keys.tar.gz",
    mimeType: "application/gzip",
    sizeBytes: 884_000,
    chunkCount: 14,
    category: "archive",
    description: "Encrypted validator key archive — gzipped, content-addressed only. Keys never appear in plaintext.",
    uploader: "0x71fD3e2c1A0B9d8e7F6c5B4a3D2c1E0fA9b8C7d6",
  },
];

/* ----------------------------------------------------------------------------
 * Indexer functions — the public surface used by the explorer pages.
 * --------------------------------------------------------------------------- */

/**
 * Pseudo-random but deterministic hash for a (cid, chainId) pair. Used for
 * mock tx hashes + block numbers so the UI populates with reproducible data.
 */
const seedHash = async (cid: string, chainId: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${cid}:${chainId}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return `0x${Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
};

interface SearchFilters {
  runtime?: ChainFamily | "all";
  status?: AnchorStatus | "all";
  category?: FileCategory | "all";
}

const matchesFilters = (
  file: RegisteredFile,
  hits: SearchHit[],
  filters: SearchFilters,
): boolean => {
  if (filters.runtime && filters.runtime !== "all") {
    if (!hits.some((h) => h.family === filters.runtime)) return false;
  }
  if (filters.status && filters.status !== "all") {
    if (!hits.some((h) => h.status === filters.status)) return false;
  }
  if (filters.category && filters.category !== "all") {
    if (file.category !== filters.category) return false;
  }
  return true;
};

/** Build a full anchor record for a given (file, chain). */
const buildHit = async (file: RegisteredFile, chainId: ChainId): Promise<SearchHit> => {
  const chain = getChain(chainId);
  if (!chain) {
    throw new Error(`Unknown chain id ${chainId}`);
  }
  const txHash = await seedHash(file.cid, chainId);
  const blockSeed = parseInt(txHash.slice(2, 10), 16);
  const blockNumber = 18_000_000 + (blockSeed % 5_000_000);
  const tsOffset =
    parseInt(txHash.slice(10, 18), 16) % (86_400 * 7);
  // Tap into mock data for uploaders so the explorer can show
  // addresses that are stable per file.
  const submitter = (file.uploader.startsWith("0x")
    ? file.uploader
    : `0x${file.uploader}`
  ).padEnd(42, "0").slice(0, 42);
  return {
    chainId,
    chainName: chain.name,
    chainShortName: chain.shortName,
    family: chain.family,
    txHash,
    blockNumber,
    timestamp: Math.floor(Date.now() / 1000) - tsOffset,
    status: chain.testnet ? "pending" : "anchored",
    submitter,
    registryAddress: chain.registryContract,
  };
};

/**
 * Build anchor hits for every supported chain for a given file. Mirrors the
 * "found on N chains" model in the explorer detail view.
 */
const buildAllHitsFor = async (file: RegisteredFile): Promise<SearchHit[]> => {
  const ids: ChainId[] = CHAINS.map((c) => c.id);
  const hits = await Promise.all(ids.map((id) => buildHit(file, id)));
  return hits;
};

/* ----- Public indexer surface --------------------------------------------- */

/**
 * Look up a CID across all chains. If the CID matches a registered file, the
 * result is fully populated. If the input is just a prefix that matches, the
 * closest single file is returned with anchors. Empty input returns [].
 */
export const searchCID = async (query: string): Promise<SearchHit[]> => {
  await new Promise((r) => setTimeout(r, 220));
  const trimmed = query.trim();
  if (!trimmed) return [];
  const file =
    MOCK_FILES.find((f) => f.cid === trimmed) ??
    MOCK_FILES.find(
      (f) =>
        f.cid.startsWith(trimmed) || trimmed.startsWith(f.cid.slice(0, 24)),
    );
  if (!file) return [];
  return buildAllHitsFor(file);
};

/**
 * Look up file metadata + all anchor hits for a single CID. Returns null
 * when the CID isn't in the registered-file index.
 */
export const lookupFile = async (
  cid: string,
): Promise<{ file: RegisteredFile; hits: SearchHit[] } | null> => {
  const trimmed = cid.trim();
  const file =
    MOCK_FILES.find((f) => f.cid === trimmed) ??
    MOCK_FILES.find(
      (f) =>
        f.cid.startsWith(trimmed) || trimmed.startsWith(f.cid.slice(0, 24)),
    );
  if (!file) return null;
  const hits = await buildAllHitsFor(file);
  return { file, hits };
};

/**
 * Recent-anchors feed for the explorer index. Includes file metadata +
 * every chain that anchored it. Sort order is most-recent-first.
 *
 * Filters narrow down by family / status / category. An artificial time
 * offset is added per row so the feed always shows a realistic, varied
 * "x seconds ago" timeline.
 */
export interface RecentAnchorRow {
  file: RegisteredFile;
  hits: SearchHit[];
  /** Earliest hit timestamp across chains — used as the "anchored at" value. */
  anchoredAt: number;
}

export const getRecentAnchors = async (
  limit = 12,
  filters: SearchFilters = {},
): Promise<RecentAnchorRow[]> => {
  await new Promise((r) => setTimeout(r, 280));
  const rows: RecentAnchorRow[] = [];
  for (let i = 0; i < MOCK_FILES.length; i++) {
    const file = MOCK_FILES[i];
    const hits = await buildAllHitsFor(file);
    if (!matchesFilters(file, hits, filters)) continue;
    const anchoredAt = Math.max(...hits.map((h) => h.timestamp));
    // Bake the file index into the timestamp so the feed looks ordered.
    rows.push({
      file,
      hits,
      anchoredAt: anchoredAt - i * 86_400, // each row a day older than the last
    });
  }
  rows.sort((a, b) => b.anchoredAt - a.anchoredAt);
  return rows.slice(0, limit);
};

/**
 * Aggregate explorer stats. Used by the index header. Numbers are fully
 * deterministic so SSR + client agree.
 */
export interface ExplorerStats {
  totalAnchors: number; // sum of (files * chains)
  totalFiles: number;
  totalChains: number;
  totalBytes: number;
  uniqueUploaders: number;
  /** Average age in seconds across the recent feed. */
  avgAgeSeconds: number;
}

export const getExplorerStats = async (): Promise<ExplorerStats> => {
  await new Promise((r) => setTimeout(r, 100));
  const totalFiles = MOCK_FILES.length;
  const totalChains = CHAINS.length;
  const totalAnchors = totalFiles * totalChains;
  const totalBytes = MOCK_FILES.reduce((acc, f) => acc + f.sizeBytes, 0);
  const uploaders = new Set(MOCK_FILES.map((f) => f.uploader));
  return {
    totalAnchors,
    totalFiles,
    totalChains,
    totalBytes,
    uniqueUploaders: uploaders.size,
    avgAgeSeconds: 86_400 * 1.4,
  };
};

/**
 * Files uploaded by the same submitter address (used on the CID detail
 * page to show "more from this uploader").
 */
export const getFilesByUploader = async (
  uploader: string,
  excludeCid?: string,
  limit = 4,
): Promise<RegisteredFile[]> => {
  await new Promise((r) => setTimeout(r, 80));
  return MOCK_FILES.filter(
    (f) => f.uploader === uploader && f.cid !== excludeCid,
  ).slice(0, limit);
};

/** Build chunk rows for a file (deterministic per-file). */
export const getChunksForFile = async (
  file: RegisteredFile,
): Promise<Array<{ index: number; cid: string; sizeBytes: number }>> => {
  await new Promise((r) => setTimeout(r, 80));
  if (file.chunkCount <= 1) {
    return [
      {
        index: 0,
        cid: file.cid,
        sizeBytes: file.sizeBytes,
      },
    ];
  }
  const enc = new TextEncoder();
  const rows: Array<{ index: number; cid: string; sizeBytes: number }> = [];
  const baseSize = Math.floor(file.sizeBytes / file.chunkCount);
  for (let i = 0; i < file.chunkCount; i++) {
    const seedStr = `${file.cid}:chunk:${i}`;
    const buf = await crypto.subtle.digest(
      "SHA-256",
      enc.encode(seedStr),
    );
    const cid = "bafy" + Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 50);
    rows.push({
      index: i,
      cid,
      sizeBytes:
        i === file.chunkCount - 1
          ? file.sizeBytes - baseSize * (file.chunkCount - 1)
          : baseSize,
    });
  }
  return rows;
};
