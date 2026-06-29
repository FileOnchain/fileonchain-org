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
      className={`flex flex-col items-center gap-4 border-2 border-dashed p-12 rounded-md ${
        dragActive ? "border-primary" : "border-border"
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
      />
      <label
        htmlFor="file-upload"
        className="flex flex-col items-center gap-2 cursor-pointer"
      >
        <span className="text-muted bg-surface border border-border rounded p-2">
          Choose File
        </span>
        <p className="text-muted">or drag and drop here</p>
      </label>
      {file && (
        <div className="text-center mt-4">
          <p className="mb-2">
            Selected file: {truncateFileName(file.name, FILE_NAME_MAX_LENGTH)}
          </p>
          {renderFileSnippet()}
          {(fileFound || txHash) && cids[0] && (
            <>
              <a
                href={`/api/cid/${cids[0].cid.toString()}`}
                target="_blank"
                className="bg-primary text-white p-2 rounded mb-4 inline-block hover:bg-primary-hover transition-colors"
              >
                View file
              </a>
              <br />
            </>
          )}
          <button
            onClick={() => setIsWalletModalOpen(true)}
            className="bg-primary text-white py-2 px-4 rounded hover:bg-primary-hover transition-colors mb-4"
          >
            {selectedAccount ? selectedAccount.address : "Connect Wallet"}
          </button>
          <br />
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="bg-muted text-white py-2 px-4 rounded hover:opacity-90 transition-opacity mb-4"
          >
            {isOpen ? "Hide" : "Show"} Multi-DAG Structure
          </button>
          {error && (
            <p className="bg-red-500 text-white p-2 rounded mb-4">{error}</p>
          )}
          {isOpen && (
            <div className="mt-4 w-full max-w-2xl bg-surface text-foreground p-4 rounded mx-auto border border-border">
              <h3 className="text-lg font-semibold mb-2">
                Multi-DAG Structure
              </h3>
              <ul className="list-disc list-inside">
                {cids.map((item, index) => (
                  <li
                    key={index}
                    className="break-words cursor-pointer hover:underline"
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
                  <pre
                    style={{ whiteSpace: "pre-wrap", wordWrap: "break-word" }}
                  >
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