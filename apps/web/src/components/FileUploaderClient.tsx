"use client";

// @polkadot/extension-dapp touches `window` at module-evaluation time, and
// @autonomys/auto-dag-data's encryption subpath references Node built-ins,
// so the entire uploader tree must stay out of the server bundle. Loading
// FileUploader via `next/dynamic` with `ssr: false` keeps the polkadot
// import off the server runtime while still streaming the rest of the page
// server-side.
import dynamic from "next/dynamic";

const FileUploader = dynamic(() => import("./FileUploader"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center p-12 text-muted">
      Loading uploader…
    </div>
  ),
});

export default FileUploader;