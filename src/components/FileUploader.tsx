"use client";

import Image from "next/image";
import { useState } from "react";
import { useFileUploader } from "@/hooks/useFileUploader";
import { useWalletStates } from "@/states/wallet";
import { truncateFileName } from "@/utils/truncateFileName";
import ConnectWalletModal from "./ConnectWalletModal";

const SNIPPET_PREVIEW_CHARS = 500;
const FILE_NAME_MAX_LENGTH = 40;

const FileUploader = () => {
  const {
    file,
    dragActive,
    fileContent,
    cids,
    isOpen,
    selectedCidData,
    txHash,
    fileFound,
    error,
    handleFileChange,
    handleDrag,
    handleDrop,
    handleCidClick,
    setIsOpen,
  } = useFileUploader();

  const selectedAccount = useWalletStates((state) => state.selectedAccount);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  const renderFileSnippet = () => {
    if (!fileContent) return null;

    if (file?.type === "application/json") {
      try {
        const jsonSnippet = JSON.stringify(
          JSON.parse(fileContent),
          null,
          2
        ).slice(0, SNIPPET_PREVIEW_CHARS);
        return (
          <pre className="bg-surface text-foreground p-4 rounded mb-4 border border-border">
            {jsonSnippet}...
          </pre>
        );
      } catch {
        return (
          <p className="bg-red-500 text-white p-4 rounded mb-4">
            Invalid JSON file
          </p>
        );
      }
    }

    if (file?.type.startsWith("text/")) {
      return (
        <pre className="bg-surface text-foreground p-4 rounded mb-4 border border-border">
          {fileContent.slice(0, SNIPPET_PREVIEW_CHARS)}...
        </pre>
      );
    }

    if (file?.type.startsWith("image/")) {
      return (
        <div className="flex justify-center items-center">
          <Image
            src={fileContent}
            alt="Preview"
            width={300}
            height={300}
            className="mb-4"
          />
        </div>
      );
    }

    return null;
  };

  return (
    <div
      role="region"
      aria-label="File uploader"
      className={`flex flex-col items-center gap-4 border-2 border-dashed p-8 md:p-12 rounded-md transition-colors duration-base ${
        dragActive ? "border-primary ring-glow" : "border-border"
      }`}
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
    >
      <input
        type="file"
        onChange={handleFileChange}
        className="hidden"
        id="file-upload"
        aria-describedby="file-upload-help"
      />
      <label
        htmlFor="file-upload"
        className="flex flex-col items-center gap-2 cursor-pointer focus-within:outline-none"
      >
        <span className="inline-flex items-center justify-center h-10 px-4 rounded-md text-sm font-medium bg-surface border border-border text-foreground hover:bg-surface-elevated transition-colors">
          Choose File
        </span>
        <p id="file-upload-help" className="text-muted text-sm">
          or drag and drop here
        </p>
      </label>
      {file && (
        <div className="text-center mt-4 w-full">
          <p className="mb-2 font-mono text-sm break-all">
            Selected file: {truncateFileName(file.name, FILE_NAME_MAX_LENGTH)}
          </p>
          {renderFileSnippet()}
          {(fileFound || txHash) && cids[0] && (
            <>
              <a
                href={`/api/cid/${cids[0].cid.toString()}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center h-10 px-4 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover transition-colors duration-base ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background mb-4"
              >
                View file
              </a>
              <br />
            </>
          )}
          <button
            onClick={() => setIsWalletModalOpen(true)}
            className="inline-flex items-center justify-center h-10 px-4 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover transition-colors duration-base ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background mb-4 font-mono break-all"
          >
            {selectedAccount ? selectedAccount.address : "Connect Wallet"}
          </button>
          <br />
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="inline-flex items-center justify-center h-10 px-4 rounded-md text-sm font-medium bg-muted text-white hover:opacity-90 transition-opacity duration-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background mb-4"
          >
            {isOpen ? "Hide" : "Show"} Multi-DAG Structure
          </button>
          {error && (
            <p role="alert" className="bg-danger text-white p-2 rounded mb-4">
              {error}
            </p>
          )}
          {isOpen && (
            <div className="mt-4 w-full max-w-2xl bg-surface text-foreground p-4 rounded mx-auto border border-border text-left">
              <h3 className="text-lg font-semibold mb-2">
                Multi-DAG Structure
              </h3>
              <ul className="list-disc list-inside">
                {cids.map((item, index) => (
                  <li
                    key={index}
                    className="break-words cursor-pointer hover:underline font-mono text-sm"
                    onClick={() =>
                      handleCidClick(item.cid, item.data, item.nextCid)
                    }
                  >
                    Chunk {index + 1}: {item.cid.toString()}
                  </li>
                ))}
              </ul>
              {selectedCidData && (
                <div className="mt-4 bg-background text-foreground p-4 rounded break-words border border-border">
                  <h4 className="text-md font-semibold mb-2">CID Data</h4>
                  <pre className="font-mono text-xs whitespace-pre-wrap break-all">
                    {JSON.stringify(selectedCidData, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <ConnectWalletModal
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
      />
    </div>
  );
};

export default FileUploader;