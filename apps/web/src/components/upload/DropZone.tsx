"use client";

import * as React from "react";
import { DragEvent, ChangeEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FiUploadCloud, FiFileText, FiImage, FiMusic, FiVideo } from "react-icons/fi";
import { cn } from "@/lib/cn";

interface DropZoneProps {
  /** Called with every selected/dropped file — first is processed, the rest queue. */
  onFiles: (files: File[]) => void;
  isLoading?: boolean;
  hint?: string;
  className?: string;
}

/* TODO: directory upload (webkitdirectory) + folder DAG assembly — for now
 * multiple files queue individually. */

/* File-type → icon mapping. Used for the small file type chips floating
 * around the dropzone so it's clear which formats we accept. */
const TYPE_ICONS = [
  { label: "images", Icon: FiImage },
  { label: "video", Icon: FiVideo },
  { label: "audio", Icon: FiMusic },
  { label: "JSON / text", Icon: FiFileText },
];

/**
 * DropZone — accessible file drop target with hover/drag glow.
 *
 * Idle state has a soft animated icon + four "accepts" chips floating
 * around the corners. On drag-over the whole surface slides into a
 * primary-tinted background and the icon nudges upward.
 */
const DropZone = ({ onFiles, isLoading = false, hint, className }: DropZoneProps) => {
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
    const selected = Array.from(e.dataTransfer.files ?? []);
    if (selected.length > 0) onFiles(selected);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length > 0) onFiles(selected);
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
      transition={{ duration: 0.18 }}
      className={cn(
        "group relative isolate flex w-full cursor-pointer flex-col items-center justify-center gap-4 overflow-hidden",
        "rounded-2xl border-2 border-dashed bg-surface/40 p-8 md:p-14 lg:p-20",
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
        multiple
        onChange={handleChange}
        className="sr-only"
        aria-describedby={`${inputId}-help`}
        disabled={isLoading}
      />

      {/* Subtle inner gradient that changes with drag state. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-slow ease-out-soft",
          dragActive && "opacity-100",
        )}
        style={{
          background:
            "radial-gradient(ellipse at center, color-mix(in srgb, var(--primary) 8%, transparent) 0%, transparent 70%)",
        }}
      />

      {/* Center icon — fizzes on drag */}
      <motion.div
        animate={dragActive ? { y: -4, scale: 1.06, rotate: -3 } : { y: 0, scale: 1, rotate: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          "flex h-16 w-16 items-center justify-center rounded-2xl border shadow-elev-1",
          dragActive
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-surface-elevated text-primary border-border group-hover:border-primary/40",
          "transition-colors duration-base",
        )}
      >
        <FiUploadCloud size={28} />
      </motion.div>

      <div className="text-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={dragActive ? "drop" : isLoading ? "loading" : "idle"}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="text-base font-semibold text-foreground"
          >
            {isLoading
              ? "Processing…"
              : dragActive
                ? "Drop to anchor"
                : "Drop a file or click to browse"}
          </motion.p>
        </AnimatePresence>
        <p id={`${inputId}-help`} className="mt-1 text-sm text-muted">
          {hint ??
            "Each chunk becomes its own transaction on the chosen chain. The registry contract stores each tx hash against the chunk's CID."}
        </p>
      </div>

      {/* File-type chips around the bottom corners */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[11px] text-muted">
        {TYPE_ICONS.map(({ label, Icon }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-elevated px-2.5 py-1"
          >
            <Icon size={11} />
            {label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-elevated px-2.5 py-1 text-muted">
          •&nbsp;any size, any type
        </span>
      </div>

      {/* Decorative dotted accents in the corners — visible only at idle. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -left-1 -top-1 h-3 w-3 rounded-tl-md border-l-2 border-t-2 border-primary/30 transition-opacity",
          dragActive ? "opacity-0" : "opacity-100",
        )}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-1 -top-1 h-3 w-3 rounded-tr-md border-r-2 border-t-2 border-primary/30 transition-opacity",
          dragActive ? "opacity-0" : "opacity-100",
        )}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -bottom-1 -left-1 h-3 w-3 rounded-bl-md border-b-2 border-l-2 border-primary/30 transition-opacity",
          dragActive ? "opacity-0" : "opacity-100",
        )}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -bottom-1 -right-1 h-3 w-3 rounded-br-md border-b-2 border-r-2 border-primary/30 transition-opacity",
          dragActive ? "opacity-0" : "opacity-100",
        )}
      />
    </motion.div>
  );
};

export default DropZone;
