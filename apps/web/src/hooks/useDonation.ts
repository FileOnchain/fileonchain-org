"use client";

import { useCallback } from "react";
import { keccak256, stringToBytes } from "viem";
import { useDonationsStates } from "@/states/donations";
import type { DonationRecipient } from "@/lib/mock/donations";
import { trackEvent } from "@/lib/analytics";

/* TODO: real DonationEscrow.donate + ERC-20 approval */

interface DonateArgs {
  recipientType: DonationRecipient;
  target: string;
  amount: string;
  memo: string;
}

export const useDonation = () => {
  const addDonation = useDonationsStates((s) => s.addDonation);

  const donate = useCallback(
    async ({ recipientType, target, amount, memo }: DonateArgs) => {
      // Simulate tx confirmation.
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 400));

      const txHash = keccak256(stringToBytes(`${recipientType}:${target}:${Date.now()}`));
      const id = keccak256(stringToBytes(`donation-${Date.now()}-${txHash}`));

      addDonation({
        id,
        donor: "0xMockedDonorAddress000000000000000000",
        recipient: "0x0001Treasury0000000000000000000000",
        recipientType,
        target,
        amount,
        memo,
        timestamp: Math.floor(Date.now() / 1000),
        txHash,
      });

      trackEvent("donation", { recipient_type: recipientType });

      return { txHash };
    },
    [addDonation],
  );

  return { donate };
};