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
  useState,
} from "react";
import { ChunkData } from "@/utils/generateCIDs";
import { readFileContent } from "@/utils/readFileContent";
import { mockAnchorCID, MockUploadResult } from "@/lib/mock/upload";
import { useChain } from "@/hooks/useChain";
import { getMockCIDRecord } from "@/lib/mock/registry";

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

export interface CIDPreview {
  cid: string;
  chainId: string;
  chainName: string;
  chainShortName: string;
  registryAddress: `0x${string}`;
  txHash: string;
  blockNumber: number;
  timestamp: number;
  submitter: string;
  status: "anchored" | "pending" | "missing";
}

export const useFileUploader = () => {
  const { activeChain } = useChain();
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [cids, setCids] = useState<ChunkData[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCidData, setSelectedCidData] = useState<SelectedCidData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [fileFound, setFileFound] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<CIDPreview | null>(null);

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

  /**
   * Run the full upload flow: ingest via IPLD, generate per-chunk CIDs,
   * call the mock anchor to simulate on-chain confirmation, populate the
   * preview panel.
   */
  const processFile = useCallback(
    async (selectedFile: File) => {
      setFile(selectedFile);
      readFileContent(selectedFile, setFileContent);
      setError(null);
      setPreview(null);
      setCids([]);
      setIsUploading(true);

      try {
        const blockstore = new MemoryBlockstore();
        const fileBufferIterable = fileToBufferIterable(selectedFile);

        const fileCID = await processFileToIPLDFormat(
          blockstore,
          fileBufferIterable,
          BigInt(selectedFile.size),
          selectedFile.name,
        );

        const cidString = cidToString(fileCID);
        // Ensure round-trip parse works
        stringToCid(cidString);

        // Mock on-chain anchor (Phase 10 — wires to real RPC later).
        const result: MockUploadResult = await mockAnchorCID({
          cid: cidString,
          chain: activeChain,
          fileSize: selectedFile.size,
        });

        setTxHash(result.txHash);

        // Resolve a preview record from the mock registry.
        const mockRecord = getMockCIDRecord(cidString, activeChain.id);
        if (mockRecord) {
          setPreview({
            cid: cidString,
            chainId: activeChain.id,
            chainName: activeChain.name,
            chainShortName: activeChain.shortName,
            registryAddress: mockRecord.registryAddress,
            txHash: result.txHash,
            blockNumber: result.blockNumber,
            timestamp: result.timestamp,
            submitter: result.submitter,
            status: "anchored",
          });
        }

        // Phase 10 wires generateCIDs to populate the chunk list; for now we
        // emit a single pseudo-chunk representing the fileCID.
        setCids([
          {
            cid: fileCID,
            data: new Uint8Array(),
          },
        ]);

        await handleSearch([{ cid: fileCID, data: new Uint8Array() }]);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setIsUploading(false);
      }
    },
    [activeChain, handleSearch],
  );

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
    cids,
    isOpen,
    selectedCidData,
    txHash,
    error,
    fileFound,
    isUploading,
    preview,
    handleFileChange,
    handleDrag,
    handleDrop,
    handleCidClick,
    processFile,
    setIsOpen,
  };
};