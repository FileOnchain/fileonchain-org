"use client";

import * as React from "react";
import FileUploader from "@/components/FileUploaderClient";

interface UploadFileSectionProps {
  /**
   * Render the compact "Try it" intro above the dropzone. The home page keeps
   * it; /upload-file supplies its own PageHeader and turns it off.
   */
  withHeader?: boolean;
}

/**
 * UploadFileSection — the core upload flow: intro copy + the client-only
 * FileUploader. Shared by the home-page dropzone section and the standalone
 * /upload-file route so the flow stays identical in both places.
 */
const UploadFileSection = ({ withHeader = true }: UploadFileSectionProps) => (
  <>
    {withHeader && (
      <header className="mb-6 w-full space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
          Try it
        </p>
        <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
          Put a file onchain
        </h2>
        <p className="max-w-3xl text-sm text-muted">
          Drop any file — a document, a photo, a dataset, an agent output.
          It&apos;s hashed in your browser and sealed into an evidence
          package; storing the bytes onchain is an optional choice — by
          default nothing but the hash leaves your machine.
        </p>
      </header>
    )}
    <FileUploader />
  </>
);

export default UploadFileSection;
