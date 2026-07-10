"use client";

import { useCallback } from "react";
import { keccak256, stringToBytes, zeroHash } from "viem";
import { donationEscrowAbi, ZERO_ADDRESS, type ChainConfig } from "@fileonchain/sdk";
import { useDonationsStates } from "@/states/donations";
import { useChain } from "@/hooks/useChain";
import { getEvmPublicClient, getEvmWalletClient } from "@/lib/evm/wallet";
import type { DonationRecipient } from "@/lib/mock/donations";
import { trackEvent } from "@/lib/analytics";

/** DonationEscrow.Recipient enum indices. */
const RECIPIENT_INDEX: Record<DonationRecipient, number> = {
  Platform: 0,
  PerCID: 1,
  PerChain: 2,
};

type DonationChain = ChainConfig & { donationContract: `0x${string}` };

export const isDonationProvisioned = (
  chain: ChainConfig,
): chain is DonationChain =>
  chain.family === "evm" &&
  !!chain.donationContract &&
  chain.donationContract !== ZERO_ADDRESS;

/**
 * The bytes32 target DonationEscrow tracks totals under: keccak256 of the
 * CID string (PerCID) or the chain id string (PerChain); zero for Platform.
 */
const targetToBytes32 = (
  recipientType: DonationRecipient,
  target: string,
): `0x${string}` =>
  recipientType === "Platform" ? zeroHash : keccak256(stringToBytes(target.trim()));

interface DonateArgs {
  recipientType: DonationRecipient;
  /** "platform", a CID string, or a ChainId — per the recipient type. */
  target: string;
  /** Human-entered amount, e.g. "5". Interpreted in the chain's native token on-chain. */
  amount: string;
  memo: string;
}

/**
 * useDonation — sends a donation. On chains where DonationEscrow is deployed
 * this is a real native-value `donate` transaction through the injected
 * wallet (the contract forwards the full amount to the treasury and tracks
 * per-CID / per-chain totals); everywhere else the simulated flow keeps the
 * page explorable.
 */
export const useDonation = () => {
  const addDonation = useDonationsStates((s) => s.addDonation);
  const { activeChain } = useChain();

  const donate = useCallback(
    async ({ recipientType, target, amount, memo }: DonateArgs) => {
      let txHash: `0x${string}`;
      let donor: `0x${string}` = "0xMockedDonorAddress000000000000000000";
      let recipient: `0x${string}` = "0x0001Treasury0000000000000000000000";
      let amountLabel = `${amount} USDC`;

      if (isDonationProvisioned(activeChain)) {
        const { parseEther } = await import("viem");
        const [publicClient, { walletClient, address }] = await Promise.all([
          getEvmPublicClient(activeChain),
          getEvmWalletClient(activeChain),
        ]);
        const treasury = (await publicClient.readContract({
          address: activeChain.donationContract,
          abi: donationEscrowAbi,
          functionName: "treasury",
        })) as `0x${string}`;

        txHash = await walletClient.writeContract({
          chain: walletClient.chain ?? null,
          account: address,
          address: activeChain.donationContract,
          abi: donationEscrowAbi,
          functionName: "donate",
          args: [RECIPIENT_INDEX[recipientType], targetToBytes32(recipientType, target), memo],
          value: parseEther(amount),
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        if (receipt.status !== "success") {
          throw new Error("donate transaction reverted");
        }
        donor = address;
        recipient = treasury;
        amountLabel = `${amount} ${activeChain.nativeCurrency.symbol}`;
      } else {
        // Simulated confirmation — fallback for chains with nothing deployed.
        await new Promise((r) => setTimeout(r, 800 + Math.random() * 400));
        txHash = keccak256(stringToBytes(`${recipientType}:${target}:${Date.now()}`));
      }

      const id = keccak256(stringToBytes(`donation-${Date.now()}-${txHash}`));

      addDonation({
        id,
        donor,
        recipient,
        recipientType,
        target,
        amount: amountLabel,
        memo,
        timestamp: Math.floor(Date.now() / 1000),
        txHash,
      });

      trackEvent("donation", { recipient_type: recipientType });

      return { txHash };
    },
    [addDonation, activeChain],
  );

  /**
   * Cumulative on-chain donations for a CID or chain target. Null when the
   * active chain has no escrow deployed or the target has no tracked total
   * (Platform donations are forwarded but not aggregated per target).
   */
  const readTargetTotal = useCallback(
    async (
      recipientType: DonationRecipient,
      target: string,
    ): Promise<bigint | null> => {
      if (recipientType === "Platform" || !isDonationProvisioned(activeChain)) {
        return null;
      }
      try {
        const publicClient = await getEvmPublicClient(activeChain);
        return (await publicClient.readContract({
          address: activeChain.donationContract,
          abi: donationEscrowAbi,
          functionName:
            recipientType === "PerCID" ? "cidDonationTotal" : "chainDonationTotal",
          args: [targetToBytes32(recipientType, target)],
        })) as bigint;
      } catch {
        return null;
      }
    },
    [activeChain],
  );

  return {
    donate,
    readTargetTotal,
    /** True when the active chain settles donations on-chain. */
    onchainReady: isDonationProvisioned(activeChain),
    activeChain,
  };
};
