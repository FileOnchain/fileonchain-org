import { keccak256, stringToBytes } from "viem";

export type DonationRecipient = "Platform" | "PerCID" | "PerChain";

export interface MockDonation {
  id: string;
  donor: `0x${string}`;
  recipient: `0x${string}`;
  recipientType: DonationRecipient;
  target: string;
  amount: string; // human-readable, e.g. "5 USDC"
  memo: string;
  timestamp: number;
  txHash: `0x${string}`;
}

/* Unprovisioned chains fall back to this seed data — see
 * `lib/server/donations.ts` for the `Donated` event scan that powers
 * real chains. */

const seed = (
  idSeed: string,
  donor: `0x${string}`,
  recipient: `0x${string}`,
  recipientType: DonationRecipient,
  target: string,
  amount: string,
  memo: string,
  timestampOffsetMinutes: number,
): MockDonation => {
  const id = keccak256(stringToBytes(idSeed));
  return {
    id,
    donor,
    recipient,
    recipientType,
    target,
    amount,
    memo,
    timestamp: Math.floor(Date.now() / 1000) - timestampOffsetMinutes * 60,
    txHash: id,
  };
};

const d = (s: string) => `0x${s.padEnd(40, "0").slice(0, 40)}` as `0x${string}`;

export const MOCK_DONATIONS: MockDonation[] = [
  seed(
    "don-1",
    "0xAa1CE0000000000000000000000000000000000" as `0x${string}`,
    d("0001Treasury"),
    "Platform",
    "platform",
    "10 USDC",
    "Keep public cache alive 🚀",
    12,
  ),
  seed(
    "don-2",
    d("B0B"),
    d("0001Treasury"),
    "PerCID",
    "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    "2 USDC",
    "Pin this for a year please",
    58,
  ),
  seed(
    "don-3",
    d("CAFE"),
    d("0001Treasury"),
    "PerChain",
    "evm:8453",
    "5 USDC",
    "Base needs more pinning",
    180,
  ),
  seed(
    "don-4",
    d("DEAD"),
    d("0001Treasury"),
    "PerCID",
    "bafybeibv3zaicqsdwfmq5dym6ipxzl5qxksirv3d3uyzjqhs2dtx3w3c3q",
    "1 USDC",
    "Foundational docs deserve permanence",
    330,
  ),
  seed(
    "don-5",
    d("FACE"),
    d("0001Treasury"),
    "Platform",
    "platform",
    "25 USDC",
    "Long-time listener, first-time donator",
    720,
  ),
  seed(
    "don-6",
    d("BEEF"),
    d("0001Treasury"),
    "PerChain",
    "substrate:autonomys-mainnet",
    "3 USDC",
    "Autonomys forever",
    1440,
  ),
];