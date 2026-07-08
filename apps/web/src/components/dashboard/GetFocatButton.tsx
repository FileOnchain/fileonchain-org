"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FiZap } from "react-icons/fi";
import Button from "@/components/ui/Button";
import FocatPackModal from "@/components/focat/FocatPackModal";

/** Client trigger pairing the server FOCAT page with the pack modal
 * (chain picker enabled); refreshes the server-rendered order table on
 * purchase. */
export const GetFocatButton = () => {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button leftIcon={<FiZap aria-hidden />} onClick={() => setOpen(true)}>
        Get FOCAT
      </Button>
      <FocatPackModal open={open} onOpenChange={setOpen} onPurchased={() => router.refresh()} />
    </>
  );
};

export default GetFocatButton;
