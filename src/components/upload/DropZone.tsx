"use client";

import * as React from "react";
import { DragEvent, ChangeEvent } from "react";
import { motion } from "framer-motion";
import { FiUploadCloud } from "react-icons/fi";
import { cn } from "@/lib/cn";

interface DropZoneProps {
  onFile: (file: File) => void;
  isLoading?: boolean;
  hint?: string;
  className?: string;
}

/**
 * DropZone — accessible file drop target with hover/drag glow. Click anywhere
 * on the surface (or the explicit button) to open the native file picker.
 */
const DropZone = ({ onFile, isLoading = false, hint, className }: DropZoneProps) => {
  const [dragActive, setDragActive] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const inputId = React.useId();

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const selected = e.dataTransfer.files?.[0];
    if (selected) onFile(selected);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) onFile(selected);
  };

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label="Drop a file or click to browse"
      aria-describedby={`${inputId}-help`}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      whileHover={{ scale: 1.005 }}
      whileTap={{ scale: 0.995 }}
      transition={{ duration: 0.15 }}
      className={cn(
        "group relative flex w-full cursor-pointer flex-col items-center justify-center gap-3",
        "rounded-xl border-2 border-dashed bg-surface/40 p-8 md:p-12 lg:p-16",
        "transition-colors duration-base ease-out-soft",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        dragActive ? "border-primary bg-primary/5 ring-glow" : "border-border hover:border-primary/40",
        className,
      )}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        onChange={handleChange}
        className="sr-only"
        aria-describedby={`${inputId}-help`}
        disabled={isLoading}
      />

      <motion.div
        animate={dragActive ? { y: -4, scale: 1.05 } : { y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-full border",
          dragActive
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-surface text-primary border-border group-hover:border-primary/40",
          "transition-colors duration-base",
        )}
      >
        <FiUploadCloud size={26} />
      </motion.div>

      <div className="text-center">
        <p className="text-base font-semibold text-foreground">
          {isLoading ? "Processing…" : dragActive ? "Drop to upload" : "Drop a file or click to browse"}
        </p>
        <p id={`${inputId}-help`} className="mt-1 text-sm text-muted">
          {hint ?? "Files are split into chunks, hashed, and anchored onchain."}
        </p>
      </div>
    </motion.div>
  );
};

export default DropZone;