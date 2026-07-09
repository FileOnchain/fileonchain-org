"use client";

import {
  cidToString,
  processFileToIPLDFormat,
  stringToCid,
} from "@autonomys/auto-dag-data";
import { MemoryBlockstore } from "blockstore-core/memory";
import {
  ChangeEvent,
  DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChainNotProvisionedError,
  ZERO_ADDRESS,
  buildStorageUri,
  getChain,
  getChunkDataBudget,
  isStorageCapable,
  type AnchorChunk,
  type ChainConfig,
  type ChainId,
} from "@fileonchain/sdk";
import { ChunkData, generateCIDs } from "@/utils/generateCIDs";
import { readFileContent } from "@/utils/readFileContent";
import { anchorFileOnChain, type AnchorOutcome } from "@/lib/anchor";
import { withRpcOverride } from "@/lib/rpc-endpoints";
import { getRpcOverrides } from "@/states/rpc-endpoints";
import { mockAnchorCID } from "@/lib/mock/upload";
import { useChain } from "@/hooks/useChain";
import { useEVMWallet } from "@/hooks/useEVMWallet";
import { useSolanaWallet } from "@/hooks/useSolanaWallet";
import { useAptosWallet } from "@/hooks/useAptosWallet";
import { useCosmosWallet } from "@/hooks/useCosmosWallet";
import { useSuiWallet } from "@/hooks/useSuiWallet";
import { useStarknetWallet } from "@/hooks/useStarknetWallet";
import { useNearWallet } from "@/hooks/useNearWallet";
import { useTronWallet } from "@/hooks/useTronWallet";
import { useCardanoWallet } from "@/hooks/useCardanoWallet";
import { useWallet } from "@/hooks/useWallet";
import { buildStarknetTypedData, NEAR_SIGN_RECIPIENT } from "@/lib/auth/wallet-message";
import { useWalletStates } from "@/states/wallet";
import type { CIDPreviewData } from "@/components/registry/CIDPreviewPanel";
import { trackEvent } from "@/lib/analytics";

const CHUNK_BUFFER_SIZE = 64 * 1024;

function fileToBufferIterable(
  file: File,
  chunkSize: number = CHUNK_BUFFER_SIZE,
): AsyncIterable<Buffer> {
  let offset = 0;
  return {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          if (offset >= file.size) {
            return { done: true, value: undefined };
          }
          const slice = file.slice(offset, offset + chunkSize);
          const buffer = await slice.arrayBuffer();
          offset += chunkSize;
          return { done: false, value: Buffer.from(buffer) };
        },
      };
    },
  };
}

type SelectedCidData = {
  cid: string;
  data: string;
  nextCid?: string;
};

export type UploadPaymentMethod = "payg" | "credits" | "byok";

export type AnchorStatus =
  | "idle"
  | "signing"
  | "storing"
  | "anchoring"
  | "done"
  | "failed";

/**
 * Where the file's bytes go:
 * - "onchain"  — chunk bytes are embedded in the anchors on a storage chain
 *   (the anchoring chain itself when it can store, Autonomys otherwise);
 * - "external" — the user already hosts the bytes and provides a URI
 *   (ipfs://…, an Auto Drive CID, https://…) for the file anchor to carry;
 * - "none"     — proof-only: anchor the CIDs, store nothing.
 */
export type StorageMode = "onchain" | "external" | "none";

/** Suggested storage fallback when the anchoring chain can't carry bytes —
 * Autonomys, the permanent-storage network (testnet mirror for testnets). */
const fallbackStorageChainId = (anchorChain: ChainConfig): ChainId =>
  anchorChain.testnet ? "substrate:autonomys-taurus" : "substrate:autonomys-mainnet";

export const useFileUploader = () => {
  const { activeChain } = useChain();
  const evm = useEVMWallet();
  const solana = useSolanaWallet();
  const aptos = useAptosWallet();
  const cosmos = useCosmosWallet();
  const sui = useSuiWallet();
  const starknet = useStarknetWallet();
  const near = useNearWallet();
  const tron = useTronWallet();
  const cardano = useCardanoWallet();
  const substrate = useWallet();
  const substrateAccount = useWalletStates((s) => s.selectedAccount);

  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileCid, setFileCid] = useState<string | null>(null);
  const [cids, setCids] = useState<ChunkData[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCidData, setSelectedCidData] = useState<SelectedCidData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [fileFound, setFileFound] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<CIDPreviewData | null>(null);

  const [paymentMethod, setPaymentMethod] = useState<UploadPaymentMethod>("payg");
  const [byokKeyId, setByokKeyId] = useState<string | null>(null);
  const [anchorStatus, setAnchorStatus] = useState<AnchorStatus>("idle");
  const [anchorProgress, setAnchorProgress] = useState(0);

  // Storage: bytes go on-chain by default; the anchoring chain is the
  // default target, Autonomys the fallback when it can't carry bytes.
  const [storageMode, setStorageMode] = useState<StorageMode>("onchain");
  const [storageChainId, setStorageChainId] = useState<ChainId | null>(null);
  const [externalUri, setExternalUri] = useState("");
  const [storageTxHash, setStorageTxHash] = useState<string | null>(null);

  /** The chain that will hold the bytes, or null when not storing on-chain. */
  const storageChain = useMemo<ChainConfig | null>(() => {
    if (storageMode !== "onchain") return null;
    const explicit = storageChainId ? getChain(storageChainId) : null;
    if (explicit && isStorageCapable(explicit)) return explicit;
    if (isStorageCapable(activeChain)) return activeChain;
    return getChain(fallbackStorageChainId(activeChain)) ?? null;
  }, [storageMode, storageChainId, activeChain]);

  /** Chunk size follows the storage chain's per-transaction data budget so
   * every chunk anchor (with bytes) fits in one transaction. */
  const chunkSize = useMemo(() => {
    if (!storageChain) return CHUNK_BUFFER_SIZE;
    return Math.min(CHUNK_BUFFER_SIZE, getChunkDataBudget(storageChain) ?? CHUNK_BUFFER_SIZE);
  }, [storageChain]);

  const handleSearch = useCallback(async (chunks: ChunkData[]) => {
    if (chunks.length === 0) return;
    try {
      const res = await fetch(`/api/search-file/${chunks[0].cid.toString()}`);
      const { found } = (await res.json()) as { found: boolean };
      setFileFound(found);
    } catch {
      setFileFound(false);
    }
  }, []);

  /** Chunk size the current `cids` were sliced with — guards the re-slice
   * effect below against redundant re-hashing. */
  const lastChunkSize = useRef(chunkSize);

  /**
   * Prepare a file: ingest via IPLD for the canonical file CID and slice
   * into real SHA-256 chunks sized for the storage chain. Anchoring is a
   * separate explicit step — see `anchor()` — so the user can pick a
   * payment method first.
   */
  const processFile = useCallback(
    async (selectedFile: File) => {
      setFile(selectedFile);
      readFileContent(selectedFile, setFileContent);
      setError(null);
      setPreview(null);
      setCids([]);
      setFileCid(null);
      setTxHash(null);
      setStorageTxHash(null);
      setAnchorStatus("idle");
      setAnchorProgress(0);
      setIsUploading(true);

      try {
        const blockstore = new MemoryBlockstore();
        const fileBufferIterable = fileToBufferIterable(selectedFile);

        const ipldCid = await processFileToIPLDFormat(
          blockstore,
          fileBufferIterable,
          BigInt(selectedFile.size),
          selectedFile.name,
        );

        const cidString = cidToString(ipldCid);
        // Ensure round-trip parse works
        stringToCid(cidString);
        setFileCid(cidString);

        // Real chunking sized to the storage chain's per-tx data budget —
        // one entry (and, in production, one transaction) per chunk, with
        // nextCid chaining.
        const chunks = await generateCIDs(selectedFile, chunkSize);
        lastChunkSize.current = chunkSize;
        setCids(chunks);

        await handleSearch(chunks);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setIsUploading(false);
      }
    },
    [handleSearch, chunkSize],
  );

  // Re-slice when the storage target (and so the chunk budget) changes.
  // Chunks are frozen once anchoring starts — only idle/failed re-slice.
  useEffect(() => {
    if (!file || isUploading) return;
    if (anchorStatus !== "idle" && anchorStatus !== "failed") return;
    if (lastChunkSize.current === chunkSize) return;
    let cancelled = false;
    void (async () => {
      const chunks = await generateCIDs(file, chunkSize);
      if (cancelled) return;
      lastChunkSize.current = chunkSize;
      setCids(chunks);
    })();
    return () => {
      cancelled = true;
    };
  }, [file, isUploading, anchorStatus, chunkSize]);

  /** One wallet signature authorizing the batch, per the active family. */
  const signAuthorization = useCallback(
    async (message: string): Promise<string> => {
      switch (activeChain.family) {
        case "evm": {
          const address = evm.address ?? (await evm.connect());
          return evm.signMessage(message, address);
        }
        case "solana": {
          if (!solana.address) await solana.connect();
          return solana.signMessage(message);
        }
        case "aptos": {
          if (!aptos.address) await aptos.connect();
          const { signature } = await aptos.signMessage(
            message,
            `${Math.floor(Math.random() * 1_000_000_000)}`,
          );
          return signature;
        }
        case "substrate": {
          if (!substrateAccount) {
            throw new Error("Connect a Substrate wallet first");
          }
          return substrate.signMessage(substrateAccount, message);
        }
        case "cosmos": {
          if (!cosmos.address) await cosmos.connect();
          const { signature } = await cosmos.signMessage(message);
          return signature;
        }
        case "sui": {
          if (!sui.address) await sui.connect();
          const { signature } = await sui.signPersonalMessage(message);
          return signature;
        }
        case "starknet": {
          if (!starknet.address) await starknet.connect();
          const felts = await starknet.signTypedData(buildStarknetTypedData(message));
          return JSON.stringify(felts);
        }
        case "near": {
          if (!near.address) await near.connect();
          const nonce = crypto.getRandomValues(new Uint8Array(32));
          const { signature } = await near.signMessage(message, nonce, NEAR_SIGN_RECIPIENT);
          return signature;
        }
        case "tron": {
          if (!tron.address) await tron.connect();
          return tron.signMessage(message);
        }
        case "cardano": {
          if (!cardano.address) await cardano.connect();
          const { signature } = await cardano.signData(message);
          return signature;
        }
        case "ton":
        case "hedera":
          // No message-signing surface on these wallets yet — the simulated
          // anchor proceeds without an authorization signature.
          return "";
      }
    },
    [
      activeChain.family,
      evm,
      solana,
      aptos,
      cosmos,
      sui,
      starknet,
      near,
      tron,
      cardano,
      substrate,
      substrateAccount,
    ],
  );

  const buildPreview = useCallback(
    (tx: { txHash: string; blockNumber?: number; submitter: string; timestamp: number }): CIDPreviewData => ({
      cid: fileCid ?? "",
      chainId: activeChain.id,
      chainName: activeChain.name,
      chainShortName: activeChain.shortName,
      registryAddress: (activeChain.registryContract ?? ZERO_ADDRESS) as `0x${string}`,
      txHash: tx.txHash,
      blockNumber: tx.blockNumber ?? 0,
      timestamp: tx.timestamp,
      submitter: tx.submitter,
      explorerUrl: activeChain.explorerUrl,
      explorerTxPath: activeChain.explorerTxPath,
      explorerAddressPath: activeChain.explorerAddressPath,
      status: "anchored",
    }),
    [activeChain, fileCid],
  );

  /**
   * Pay-as-you-go: send the real per-chunk transactions for the active
   * family via `lib/anchor`. Storage happens first: when the storage chain
   * differs from the anchoring chain, a storage pass embeds the bytes there
   * and the anchor pass carries a `fileonchain://` URI pointing at it; when
   * they're the same chain, one combined pass stores and anchors together.
   * When the anchoring chain has nothing deployed yet, fall back to the
   * previous simulated flow — one authorization signature, ticking
   * progress, then the mock anchor.
   */
  const anchorPayg = useCallback(async (): Promise<AnchorOutcome> => {
    if (!file || !fileCid) throw new Error("No file prepared");
    const chunks: AnchorChunk[] = cids.map((chunk, index) => ({
      cid: chunk.cid.toString(),
      index,
      nextCid: chunk.nextCid?.toString(),
      data: chunk.data,
    }));
    // Senders that dial an RPC themselves honor the account's custom
    // endpoint; wallet-broadcast families ignore rpcUrl anyway.
    const rpcOverrides = getRpcOverrides();

    try {
      // Storage pass — bytes embedded in chunk anchors on the storage
      // chain. Its provisioning failure is the user's to resolve (pick
      // another storage chain), never silently mocked.
      let uri: string | undefined;
      const storesOnAnchorChain = storageChain?.id === activeChain.id;
      if (storageChain && !storesOnAnchorChain) {
        setAnchorStatus("storing");
        try {
          const stored = await anchorFileOnChain({
            chain: withRpcOverride(storageChain, rpcOverrides),
            fileCid,
            chunks,
            includeData: true,
            onProgress: (progress) => {
              setAnchorStatus(progress.stage === "signing" ? "signing" : "storing");
              setAnchorProgress(progress.chunksAnchored);
            },
          });
          setStorageTxHash(stored.txHash);
          uri = buildStorageUri(storageChain.id, fileCid);
          trackEvent("chain_anchor_success", {
            family: storageChain.family,
            chain_id: storageChain.id,
            payment_method: "payg",
            chunk_count: chunks.length,
          });
        } catch (error) {
          if (error instanceof ChainNotProvisionedError) {
            throw new Error(
              `${storageChain.name} can't store bytes for real yet. Pick a different storage chain, or switch storage off.`,
            );
          }
          throw error;
        }
      } else if (storageMode === "external" && externalUri.trim()) {
        uri = externalUri.trim();
      }

      // Anchor pass — proof-only unless the anchoring chain is also the
      // storage chain. Bytes are stripped on proof-only passes so a
      // storage-first chain's default embed can't sneak them in twice.
      setAnchorStatus("signing");
      setAnchorProgress(0);
      const outcome = await anchorFileOnChain({
        chain: withRpcOverride(activeChain, rpcOverrides),
        fileCid,
        chunks: storesOnAnchorChain
          ? chunks
          : chunks.map(({ cid, index, nextCid }) => ({ cid, index, nextCid })),
        includeData: Boolean(storesOnAnchorChain),
        uri,
        onProgress: (progress) => {
          setAnchorStatus(progress.stage === "signing" ? "signing" : "anchoring");
          setAnchorProgress(progress.chunksAnchored);
        },
      });
      trackEvent("chain_anchor_success", {
        family: activeChain.family,
        chain_id: activeChain.id,
        payment_method: "payg",
        chunk_count: chunks.length,
      });
      return outcome;
    } catch (error) {
      if (!(error instanceof ChainNotProvisionedError)) throw error;
      trackEvent("chain_anchor_fallback_mock", {
        family: activeChain.family,
        chain_id: activeChain.id,
      });
    }

    setAnchorStatus("signing");
    await signAuthorization(
      `FileOnChain: anchor ${fileCid} — ${cids.length} chunk(s) on ${activeChain.name}`,
    );
    setAnchorStatus("anchoring");
    for (let i = 0; i < cids.length; i += 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(60, 1200 / cids.length)),
      );
      setAnchorProgress(i + 1);
    }
    const result = await mockAnchorCID({
      cid: fileCid,
      chain: activeChain,
      fileSize: file.size,
    });
    return {
      txHash: result.txHash,
      txHashes: [result.txHash],
      blockNumber: result.blockNumber,
      timestamp: result.timestamp,
      submitter: result.submitter,
      simulated: true,
    };
  }, [
    file,
    fileCid,
    cids,
    activeChain,
    storageChain,
    storageMode,
    externalUri,
    signAuthorization,
  ]);

  /**
   * Anchor the prepared file with the selected payment method.
   *
   * - "payg": real per-chunk transactions signed by the connected wallet
   *   (simulated only on chains with nothing deployed yet — see anchorPayg).
   * - "credits" / "byok": POST /api/uploads and the backend anchors
   *   server-side; no wallet interaction.
   */
  const anchor = useCallback(async () => {
    if (!file || !fileCid || cids.length === 0) return;
    // Belt-and-braces: pickers already refuse non-active chains, but the
    // active chain can arrive from persisted state.
    if (activeChain.status !== "active") {
      setError(
        `${activeChain.name} is ${activeChain.status} — anchoring isn't open on it. Switch to an active chain.`,
      );
      return;
    }
    setError(null);
    setAnchorProgress(0);
    setStorageTxHash(null);

    try {
      if (paymentMethod === "payg") {
        const outcome = await anchorPayg();
        setTxHash(outcome.txHash);
        setPreview(
          buildPreview({
            txHash: outcome.txHash,
            blockNumber: outcome.blockNumber,
            submitter: outcome.submitter,
            timestamp: outcome.timestamp,
          }),
        );
        setAnchorProgress(cids.length);
      } else {
        setAnchorStatus("anchoring");
        const res = await fetch("/api/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cid: fileCid,
            fileName: file.name,
            fileSizeBytes: file.size,
            chunkCount: cids.length,
            chainIds: [activeChain.id],
            paymentMethod: paymentMethod === "byok" ? "byok" : "credits",
            byokKeyId: paymentMethod === "byok" ? byokKeyId : undefined,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          if (res.status === 401) {
            throw new Error("Sign in to anchor with account credits");
          }
          throw new Error(data?.error ?? "Anchoring failed");
        }
        const { job } = await res.json();
        const firstTx = job.txHashes?.[0];
        if (firstTx) {
          setTxHash(firstTx.txHash);
          setPreview(
            buildPreview({
              txHash: firstTx.txHash,
              blockNumber: firstTx.blockNumber,
              submitter: "FileOnChain backend",
              timestamp: Math.floor(Date.now() / 1000),
            }),
          );
        }
        setAnchorProgress(cids.length);
        trackEvent("chain_anchor_success", {
          family: activeChain.family,
          chain_id: activeChain.id,
          payment_method: paymentMethod === "byok" ? "byok" : "credits",
          chunk_count: cids.length,
        });
      }

      setAnchorStatus("done");
      trackEvent("anchor_paid", {
        method: paymentMethod,
        chain_count: 1,
        chunk_count: cids.length,
      });
      trackEvent("file_upload", {
        chain_id: activeChain.id,
        chain_family: activeChain.family,
        file_size: file.size,
        status: "success",
      });
    } catch (e) {
      setAnchorStatus("failed");
      setError((e as Error).message);
      trackEvent("file_upload", {
        chain_id: activeChain.id,
        chain_family: activeChain.family,
        file_size: file.size,
        status: "error",
      });
    }
  }, [
    file,
    fileCid,
    cids,
    paymentMethod,
    byokKeyId,
    activeChain,
    anchorPayg,
    buildPreview,
  ]);

  const handleFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (!selected) return;
      await processFile(selected);
    },
    [processFile],
  );

  const handleDrag = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      const selected = e.dataTransfer.files?.[0];
      if (!selected) return;
      await processFile(selected);
    },
    [processFile],
  );

  const handleCidClick = useCallback(
    (cid: ChunkData["cid"], data: Uint8Array, nextCid?: ChunkData["cid"]) => {
      setSelectedCidData({
        cid: cid.toString(),
        data: new TextDecoder().decode(data),
        nextCid: nextCid ? nextCid.toString() : undefined,
      });
    },
    [],
  );

  return {
    file,
    dragActive,
    fileContent,
    fileCid,
    cids,
    isOpen,
    selectedCidData,
    txHash,
    error,
    fileFound,
    isUploading,
    preview,
    paymentMethod,
    byokKeyId,
    anchorStatus,
    anchorProgress,
    storageMode,
    storageChain,
    externalUri,
    chunkSize,
    storageTxHash,
    setStorageMode,
    setStorageChainId,
    setExternalUri,
    setPaymentMethod,
    setByokKeyId,
    anchor,
    handleFileChange,
    handleDrag,
    handleDrop,
    handleCidClick,
    processFile,
    setIsOpen,
  };
};
