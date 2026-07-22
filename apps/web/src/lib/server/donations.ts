import "server-only";
import {
  CHAINS,
  ZERO_ADDRESS,
  donationEscrowAbi,
  isChainActive,
  type ChainConfig,
} from "@fileonchain/sdk";
import type { MockDonation, DonationRecipient } from "@/lib/mock/donations";
import { RPC_TRANSPORT_OPTS } from "@/lib/scan-window";

/**
 * Real `DonationEscrow` contract reads — fills the `useDonationsStates`
 * Zustand store with the `Donated` event stream. The `useDonation` hook
 * (the write path) already routes real native-value `donate()` calls
 * through the injected wallet on Sepolia + Chronos; this module is the
 * matching read path so the `DonationsFeed` + `DonationImpactStrip` stop
 * seeding from `MOCK_DONATIONS`.
 *
 * Per chain we walk a bounded `Donated` event lookback window
 * (`maxDonationLookbackBlocks`), map each event into a `MockDonation`,
 * and sort across chains by event timestamp descending. The `Donated`
 * event only stores the `target` bytes32 hash, so `cidDonationTotal` /
 * `chainDonationTotal` cannot recover the original CID/chainId from the
 * hash alone — the off-chain `donation_targets` table needed to reverse
 * the mapping is the next follow-up.
 *
 * `amount` is the chain's native token in wei (the contract is `payable`
 * and forwards the full amount to `treasury`). The impact strip uses the
 * chain's `nativeSymbol` to render the right unit.
 */

type DonationChain = ChainConfig & { donationContract: `0x${string}` };

const isDonationProvisioned = (
  chain: ChainConfig | undefined,
): chain is DonationChain =>
  !!chain &&
  chain.family === "evm" &&
  chain.status !== "deprecated" &&
  isChainActive(chain) &&
  !!chain.donationContract &&
  chain.donationContract !== ZERO_ADDRESS;

/** Walkback window for the donation feed — ~30 days on a 12s EVM chain. */
const DONATION_LOOKBACK_BLOCKS = 200_000n;

const RECIPIENT_INDEX_TO_LABEL: readonly DonationRecipient[] = [
  "Platform",
  "PerCID",
  "PerChain",
];

const readTreasuryForChain = async (
  chain: DonationChain,
): Promise<`0x${string}` | null> => {
  try {
    const { createPublicClient, http } = await import("viem");
    const { toViemChain } = await import("@fileonchain/sdk/evm");
    const client = createPublicClient({
      chain: toViemChain(chain),
      transport: http(chain.rpcUrl, RPC_TRANSPORT_OPTS),
    });
    return (await client.readContract({
      address: chain.donationContract,
      abi: donationEscrowAbi,
      functionName: "treasury",
    })) as `0x${string}`;
  } catch {
    return null;
  }
};

const readDonationsForChain = async (
  chain: DonationChain,
  limit: number,
): Promise<MockDonation[]> => {
  const { createPublicClient, http, parseAbiItem } = await import("viem");
  const { toViemChain } = await import("@fileonchain/sdk/evm");
  const client = createPublicClient({
    chain: toViemChain(chain),
    transport: http(chain.rpcUrl, RPC_TRANSPORT_OPTS),
  });

  const donated = parseAbiItem(
    "event Donated(address indexed donor, address indexed recipient, uint256 amount, uint8 indexed recipientType, bytes32 target, string memo, uint256 timestamp)",
  );

  let logs;
  try {
    const head = await client.getBlockNumber();
    const fromBlock = head > DONATION_LOOKBACK_BLOCKS
      ? head - DONATION_LOOKBACK_BLOCKS
      : 0n;
    logs = await client.getLogs({
      address: chain.donationContract,
      event: donated,
      fromBlock,
      toBlock: head,
    });
  } catch {
    return [];
  }

  return logs.slice(-limit).map((log) => {
    const recipientTypeIndex = Number(log.args.recipientType);
    const recipientType: DonationRecipient =
      RECIPIENT_INDEX_TO_LABEL[recipientTypeIndex] ?? "Platform";
    const amountWei = log.args.amount as bigint;
    // Native-token wei → human-readable decimal string in the chain's
    // smallest unit. The impact strip will pair this with
    // `chain.nativeSymbol`.
    const amountDecimal = amountWei.toString();
    return {
      id: `${log.transactionHash ?? ""}:${log.logIndex ?? ""}`,
      donor: (log.args.donor ?? "0x0") as `0x${string}`,
      recipient: (log.args.recipient ?? ZERO_ADDRESS) as `0x${string}`,
      recipientType,
      // The contract stores `target` as bytes32; the original CID /
      // chainId can't be recovered from the hash without an off-chain
      // index, so we render the bytes32 hex for now.
      target: (log.args.target ?? "0x") as string,
      amount: amountDecimal,
      memo: (log.args.memo ?? "") as string,
      timestamp: Number(log.args.timestamp ?? 0),
      txHash: (log.transactionHash ?? "0x") as `0x${string}`,
    } satisfies MockDonation;
  });
};

/**
 * Treasury address for the chain's deployed `DonationEscrow`. Returns
 * null on read failure or when the chain isn't provisioned.
 */
export const getTreasuryAddress = async (
  chainId: ChainConfig["id"],
): Promise<`0x${string}` | null> => {
  const chain = CHAINS.find((c) => c.id === chainId);
  if (!isDonationProvisioned(chain)) return null;
  return readTreasuryForChain(chain);
};

/**
 * Recent donations across every provisioned EVM chain, sorted by event
 * timestamp descending. Returns at most `limit` rows.
 */
export const getRecentDonations = async (
  limit = 20,
): Promise<MockDonation[]> => {
  const chains = CHAINS.filter(isDonationProvisioned);
  const results = await Promise.all(
    chains.map((chain) => readDonationsForChain(chain, limit)),
  );
  return results
    .flat()
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
};
