"use client";

import * as React from "react";
import { FiCheck, FiCopy } from "react-icons/fi";
import { cn } from "@/lib/cn";

interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
  ariaLabel?: string;
}

/**
 * CopyButton — copies `value` to clipboard and shows a transient check mark.
 * Use wherever a CID, address, tx hash, or other opaque string is shown so
 * users can grab it with one click.
 */
export const CopyButton = ({ value, label, className, ariaLabel }: CopyButtonProps) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Silent fail — user can still read the value.
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={ariaLabel ?? `Copy ${label ?? "value"}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md p-1.5 text-muted",
        "hover:text-foreground hover:bg-surface transition-colors duration-base",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        className,
      )}
    >
      {copied ? <FiCheck size={14} className="text-success" /> : <FiCopy size={14} />}
      {label && <span className="text-xs">{copied ? "Copied" : label}</span>}
    </button>
  );
};

export default CopyButton;