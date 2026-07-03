"use client";

import * as React from "react";
import { FiPlus } from "react-icons/fi";
import Button from "@/components/ui/Button";
import DepositModal from "@/components/dashboard/DepositModal";

/** Client trigger pairing the server credits page with the deposit modal. */
export const AddCreditsButton = () => {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button leftIcon={<FiPlus aria-hidden />} onClick={() => setOpen(true)}>
        Add credits
      </Button>
      <DepositModal open={open} onOpenChange={setOpen} />
    </>
  );
};

export default AddCreditsButton;
