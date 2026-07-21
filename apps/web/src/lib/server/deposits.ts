import "server-only";
import { and, eq } from "drizzle-orm";
import {
  type ChainConfig,
  type ChainId,
  ZERO_ADDRESS,
  isChainActive,
  CHAINS,
} from "@fileonchain/sdk";
import {
  db,
  deposits,
  depositCursors,
  creditLedger,
} from "@/lib/db";
import { logActivities } from "@/lib/server/activity";
import { microToUsdc } from "@/lib/usdc";
import { SCAN_WINDOW_BLOCKS, CONFIRMED_TAG, RPC_TRANSPORT_OPTS } from "@/lib/scan-window";

/**
 * USDC Transfer-event watcher. The cron entry is
 * `/api/cron/deposits-watch` (see `vercel.json`); ops can also run it
 * manually via `scripts/deposits-watch.ts`.
 *
 * For every EVM chain that records a non-zero `usdcContract` (the same
 * `isVerifiable` predicate the confirm route uses), the watcher:
 *   1. Reads `deposit_cursor.last_scanned_block` (0 if missing).
 *   2. Pulls `Transfer(to, value)` logs from `usdcContract` between
 *      that block and the last finalized block on the chain.
 *   3. Filters logs whose `to` matches a `pending` deposit address on
 *      this chain.
 *   4. For each matching log, runs an atomic confirm-and-credit
 *      transaction: SELECT … FOR UPDATE the matching pending deposit
 *      (by `(chain_id, deposit_address, amount_micro_usdc)`),
 *      UPDATE to `confirmed` + INSERT into `credit_ledger`. The unique
 *      `deposit.tx_hash` index guarantees a hash already credited
 *      cannot be re-applied.
 *   5. Bumps the cursor to the head (one chain's RPC failure cannot
 *      stall another chain).
 *
 * A hash collision (the watcher and the manual confirm race) is
 * resolved at the DB layer: the unique index rejects the second
 * commit; whichever path lands first wins, the other rolls back.
 *
 * `confirmedAt` and the matched deposit row flow back out of the
 * transaction so the activity log can be emitted without re-SELECTing.
 */

/** Mirror of the predicate in `api/credits/deposit/[id]/confirm/route.ts`
 *  — chains with a real MockUSDC deployed (Sepolia, Auto EVM Chronos). */
const isVerifiable = (
  chain: ChainConfig | undefined,
): chain is ChainConfig & { usdcContract: `0x${string}` } =>
  !!chain &&
  chain.family === "evm" &&
  chain.status !== "deprecated" &&
  isChainActive(chain) &&
  !!chain.usdcContract &&
  chain.usdcContract !== ZERO_ADDRESS;

interface ConfirmedDeposit {
  id: string;
  userId: string;
  chainId: ChainId;
  amountMicroUsdc: bigint;
}

/** Single confirmation. Returns the confirmed deposit row when a credit
 *  was applied, `null` when the log was a no-op (no matching pending
 *  deposit / already claimed / amount mismatch). Throws when the DB
 *  transaction fails — the caller decides whether to swallow or surface. */
const confirmTransfer = async (
  log: { txHash: `0x${string}`; to: `0x${string}`; value: bigint },
  chainId: ChainId,
): Promise<ConfirmedDeposit | null> => {
  // The watcher matches on `(chain_id, deposit_address, amount)` so an
  // over-funded log (value > amount) still credits the deposit row —
  // the leftover sits at the address, which is exactly what we want
  // for ad-hoc top-ups. An under-funded log is skipped and the row
  // stays pending until the next cron tick picks it up.
  return db.transaction(async (tx) => {
    const [pending] = await tx
      .select({ id: deposits.id })
      .from(deposits)
      .where(
        and(
          eq(deposits.chainId, chainId),
          eq(deposits.depositAddress, log.to.toLowerCase()),
          eq(deposits.amountMicroUsdc, log.value),
          eq(deposits.status, "pending"),
        ),
      )
      .limit(1)
      .for("update");
    if (!pending) return null;

    // The unique `deposit.tx_hash` index makes a second commit fail
    // before we even get here, so any pre-claim by the manual confirm
    // path is caught above. We re-check defensively in case of an
    // unset index on a brand-new dev DB.
    const [existing] = await tx
      .select({ id: deposits.id })
      .from(deposits)
      .where(eq(deposits.txHash, log.txHash))
      .limit(1);
    if (existing) return null;

    const [updated] = await tx
      .update(deposits)
      .set({
        status: "confirmed",
        confirmedAt: new Date(),
        txHash: log.txHash,
      })
      .where(
        and(
          eq(deposits.id, pending.id),
          eq(deposits.status, "pending"),
        ),
      )
      .returning();
    if (!updated) return null;

    await tx.insert(creditLedger).values({
      userId: updated.userId,
      deltaMicroUsdc: updated.amountMicroUsdc,
      reason: "deposit",
      refType: "deposit",
      refId: updated.id,
    });
    return {
      id: updated.id,
      userId: updated.userId,
      chainId: updated.chainId as ChainId,
      amountMicroUsdc: updated.amountMicroUsdc,
    };
  });
};

const scanChain = async (
  chain: ChainConfig & { usdcContract: `0x${string}` },
): Promise<{
  chainId: ChainId;
  fromBlock: number;
  toBlock: number;
  confirmed: number;
}> => {
  const { createPublicClient, http, parseAbiItem } = await import("viem");
  const { toViemChain } = await import("@fileonchain/sdk/evm");
  const client = createPublicClient({
    chain: toViemChain(chain),
    transport: http(chain.rpcUrl, RPC_TRANSPORT_OPTS),
  });

  const [cursor] = await db
    .select({ lastScannedBlock: depositCursors.lastScannedBlock })
    .from(depositCursors)
    .where(eq(depositCursors.chainId, chain.id))
    .limit(1);
  const fromBlock = cursor ? Number(cursor.lastScannedBlock) + 1 : 0;

  // Cap the scan window so a long outage cannot produce a multi-day
  // `getLogs` request that the RPC rejects. Walking up to the last
  // finalized block (not `latest`) keeps the cursor honest through
  // reorgs — a dropped block simply gets re-scanned on the next tick.
  // viem 2.53 exposes `finalized` as a `BlockTag` on `getBlock` (the
  // cheaper `getBlockNumber` always returns `latest`).
  const headBlock = await client.getBlock({
    blockTag: CONFIRMED_TAG,
    includeTransactions: false,
  });
  const toBlock = Number(headBlock.number);
  const safeTo = Math.min(toBlock, fromBlock + SCAN_WINDOW_BLOCKS);

  if (fromBlock > safeTo) {
    return { chainId: chain.id, fromBlock, toBlock: safeTo, confirmed: 0 };
  }

  const logs = await client.getLogs({
    address: chain.usdcContract,
    event: parseAbiItem(
      "event Transfer(address indexed from, address indexed to, uint256 value)",
    ),
    fromBlock: BigInt(fromBlock),
    toBlock: BigInt(safeTo),
  });

  // Pull the set of pending addresses once — cheaper than a SELECT per
  // log, and the addresses are how we filter out non-deposit transfers.
  const pendingAddresses = await db
    .selectDistinct({ address: deposits.depositAddress })
    .from(deposits)
    .where(
      and(
        eq(deposits.chainId, chain.id),
        eq(deposits.status, "pending"),
      ),
    );
  const pendingSet = new Set(pendingAddresses.map((r) => r.address));
  if (pendingSet.size === 0) {
    return { chainId: chain.id, fromBlock, toBlock: safeTo, confirmed: 0 };
  }

  let confirmed = 0;
  const matched: Array<{ txHash: `0x${string}`; deposit: ConfirmedDeposit }> = [];
  for (const log of logs) {
    const to = log.args.to;
    const value = log.args.value;
    if (typeof to !== "string" || typeof value !== "bigint") continue;
    const toLower = to.toLowerCase();
    if (!pendingSet.has(toLower)) continue;
    try {
      const confirmedDeposit = await confirmTransfer(
        { txHash: log.transactionHash!, to: to as `0x${string}`, value },
        chain.id,
      );
      if (confirmedDeposit) {
        confirmed += 1;
        matched.push({
          txHash: log.transactionHash!,
          deposit: confirmedDeposit,
        });
      }
    } catch (error) {
      // One bad log must not poison the rest of the batch. The deposit
      // row stays pending and the next cron tick retries.
      console.error("[deposits-watch] confirm failed", {
        chainId: chain.id,
        txHash: log.transactionHash,
        error,
      });
    }
  }

  // Move the cursor forward — even when no deposits were confirmed,
  // we want to advance so a quiet chain doesn't keep re-scanning the
  // same window on every tick.
  await db
    .insert(depositCursors)
    .values({ chainId: chain.id, lastScannedBlock: safeTo })
    .onConflictDoUpdate({
      target: depositCursors.chainId,
      set: { lastScannedBlock: safeTo, updatedAt: new Date() },
    });

  // One batch INSERT for the whole tick — N round trips collapsed to
  // one. The data `confirmTransfer` returned is enough for the
  // activity log; no extra `SELECT` against `deposits` here.
  await logActivities(
    matched.map((m) => ({
      userId: m.deposit.userId,
      type: "deposit_auto_confirmed",
      metadata: {
        depositId: m.deposit.id,
        chainId: m.deposit.chainId,
        amountUsdc: microToUsdc(m.deposit.amountMicroUsdc),
        txHash: m.txHash,
      },
    })),
  );

  return { chainId: chain.id, fromBlock, toBlock: safeTo, confirmed };
};

export interface DepositWatchReport {
  chains: Array<{
    chainId: ChainId;
    fromBlock: number;
    toBlock: number;
    confirmed: number;
  }>;
  totalConfirmed: number;
}

/** Walk every verifiable EVM chain in parallel. A failure on one chain
 *  does not stop the others — they are independent RPCs and independent
 *  cursors. `Promise.allSettled` keeps the per-chain errors observable
 *  without short-circuiting. The cron route just reports the aggregate. */
export const runDepositWatch = async (): Promise<DepositWatchReport> => {
  const verifiable = CHAINS.filter(isVerifiable);
  const settled = await Promise.allSettled(
    verifiable.map((chain) => scanChain(chain)),
  );
  const chains = settled.map((s, idx) => {
    if (s.status === "fulfilled") return s.value;
    const chainId = verifiable[idx]!.id;
    console.error("[deposits-watch] chain scan failed", { chainId, error: s.reason });
    // Leave the cursor at its prior value so the next tick retries
    // from the same starting block.
    return { chainId, fromBlock: 0, toBlock: 0, confirmed: 0 };
  });
  const totalConfirmed = chains.reduce((acc, r) => acc + r.confirmed, 0);
  return { chains, totalConfirmed };
};
