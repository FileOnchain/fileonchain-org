"use client";

import * as React from "react";
import { FiHeart } from "react-icons/fi";
import { Button } from "@/components/ui/Button";
import DonateModal from "./DonateModal";

interface DonateButtonProps {
  cid?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  label?: string;
}

/**
 * DonateButton — pill button that opens DonateModal pre-set to PerCID when
 * a CID is supplied. Used on the upload page and explorer detail pages.
 */
export const DonateButton = ({ cid, variant = "secondary", size = "sm", label }: DonateButtonProps) => {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        leftIcon={<FiHeart size={14} />}
        onClick={() => setOpen(true)}
      >
        {label ?? "Donate"}
      </Button>
      <DonateModal open={open} onOpenChange={setOpen} defaultCid={cid} />
    </>
  );
};

export default DonateButton;