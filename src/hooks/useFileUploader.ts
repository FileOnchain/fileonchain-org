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
  useState,
} from "react";
import { ChunkData } from "@/utils/generateCIDs";
import { readFileContent } from "@/utils/readFileContent";

const CHUNK_BUFFER_SIZE = 64 * 1024; // 64KB streaming buffer for the blockstore

// Streams a File as an AsyncIterable<Buffer> for IPLD ingestion.
function fileToBufferIterable(
  file: File,
  chunkSize: number = CHUNK_BUFFER_SIZE
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

export const useFileUploader = () => {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [fileContent, setFileContent] = useState<string | null>(null);
  // cids stays empty until generateCIDs is wired into the upload pipeline.
  // The setter is retained so downstream callers can populate it then.
  const [cids, ,] = useState<ChunkData[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCidData, setSelectedCidData] =
    useState<SelectedCidData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // txHash is populated by the upload flow once it's wired up; for now the
  // value stays null so the "View file" branch keys off fileFound alone.
  const txHash: string | null = null;
  const [fileFound, setFileFound] = useState(false);

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

  useEffect(() => {
    handleSearch(cids);
  }, [cids, handleSearch]);

  const processFile = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    readFileContent(selectedFile, setFileContent);
    setError(null);

    const blockstore = new MemoryBlockstore();
    const fileBufferIterable = fileToBufferIterable(selectedFile);

    const fileCID = await processFileToIPLDFormat(
      blockstore,
      fileBufferIterable,
      BigInt(selectedFile.size),
      selectedFile.name
    );

    // Round-trip the CID through its string form to confirm it serializes
    // and parses cleanly — useful when handing it to downstream APIs.
    stringToCid(cidToString(fileCID));
  }, []);

  const handleFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (!selected) return;
      await processFile(selected);
    },
    [processFile]
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
    [processFile]
  );

  const handleCidClick = useCallback(
    (cid: ChunkData["cid"], data: Uint8Array, nextCid?: ChunkData["cid"]) => {
      setSelectedCidData({
        cid: cid.toString(),
        data: new TextDecoder().decode(data),
        nextCid: nextCid ? nextCid.toString() : undefined,
      });
    },
    []
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
    handleFileChange,
    handleDrag,
    handleDrop,
    handleCidClick,
    processFile,
    setIsOpen,
  };
};
