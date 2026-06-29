"use client";

import * as React from "react";
import { FiDownload } from "react-icons/fi";
import { Button } from "@/components/ui/Button";

interface DataRebuilderProps {
  cid: string;
  /** All chains where this CID was found — used in the mock download name. */
  chainCount: number;
}

/**
 * DataRebuilder — "rebuild & download" button. In production this rehydrates
 * the file from IPFS / IPLD blocks across the chains where it was anchored.
 * Mock implementation ships a placeholder text blob.
 */
export const DataRebuilder = ({ cid, chainCount }: DataRebuilderProps) => {
  const handleDownload = () => {
    /* TODO: real reassembly from IPFS/IPLD chunks across chains */
    const blob = new Blob(
      [
        `Mock rebuild for CID: ${cid}\nFound on ${chainCount} chains.\n\nThis is a placeholder. Real reassembly will rehydrate the file from IPLD chunks.`,
      ],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${cid.slice(0, 16)}-rebuild.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Button leftIcon={<FiDownload size={16} />} onClick={handleDownload}>
      Rebuild & download
    </Button>
  );
};

export default DataRebuilder;