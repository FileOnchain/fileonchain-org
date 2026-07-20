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
import { logActivity } from "@/lib/server/activity";
import { microToUsdc } from "@/lib/usdc";

/**
 * USDC Transfer-event watcher. The cron entry is
 * `/api/cron/deposits-watch` (see `vercel.json`); ops can also run it
 * manually via `scripts/deposits-watch.ts`.
 *
 * For every EVM chain that records a non-zero `usdcContract` (the same
 * `isVerifiable` predicate the confirm route uses), the watcher:
 *   1. Reads `deposit_cursor.last_scanned_block` (0 if missing).
 *   2. Pulls `Transfer(to, value)` logs from `usdcContract` between
 *      that block and the chain's head.
 *   3. Filters logs whose `to` matches a `pending` deposit address on
 *      this chain.
 *   4. For each matching log, runs an atomic confirm-and-credit
 *      transaction: SELECT … FOR UPDATE the matching pending deposit
 *      (by `(chain_id, deposit_address, amount_micro_usdc)`),
 *      UPDATE to `confirmed` + INSERT into `credit_ledger` +
 *      `logActivity('deposit_auto_confirmed')`. The unique
 *      `deposit.tx_hash` index guarantees a hash already credited
 *      cannot be re-applied.
 *   5. Bumps the cursor to the chain head (one chain's RPC failure
 *      cannot stall another chain).
 *
 * A hash collision (the watcher and the manual confirm race) is
 * resolved at the DB layer: the unique index rejects the second
 * commit; whichever path lands first wins, the other rolls back.
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

/** Single confirmation. Returns true when a deposit was credited, false
 *  when the log was a no-op (no matching pending deposit / already
 *  claimed / amount mismatch). Throws when the DB transaction fails —
 *  the caller decides whether to swallow or surface. */
const confirmTransfer = async (
  log: { txHash: `0x${string}`; to: `0x${string}`; value: bigint },
  chainId: ChainId,
): Promise<{ confirmed: boolean; depositId?: string }> => {
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
    if (!pending) return { confirmed: false };

    // The unique `deposit.tx_hash` index makes a second commit fail
    // before we even get here, so any pre-claim by the manual confirm
    // path is caught above. We re-check defensively in case of an
    // unset index on a brand-new dev DB.
    const [existing] = await tx
      .select({ id: deposits.id })
      .from(deposits)
      .where(eq(deposits.txHash, log.txHash))
      .limit(1);
    if (existing) return { confirmed: false };

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
    if (!updated) return { confirmed: false };

    await tx.insert(creditLedger).values({
      userId: updated.userId,
      deltaMicroUsdc: updated.amountMicroUsdc,
      reason: "deposit",
      refType: "deposit",
      refId: updated.id,
    });
    return { confirmed: true, depositId: updated.id };
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
    transport: http(chain.rpcUrl),
  });

  const [cursor] = await db
    .select({ lastScannedBlock: depositCursors.lastScannedBlock })
    .from(depositCursors)
    .where(eq(depositCursors.chainId, chain.id))
    .limit(1);
  const fromBlock = cursor ? Number(cursor.lastScannedBlock) + 1 : 0;

  // Cap the scan window so a long outage cannot produce a multi-day
  // `getLogs` request that the RPC rejects. 10_000 blocks ≈ 33h on
  // Sepolia (12s blocks) and 5.5h on Auto EVM Chronos (2s blocks).
  const head = await client.getBlockNumber();
  const toBlock = Number(head);
  const safeTo = Math.min(toBlock, fromBlock + 9_999);

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
  const matched: Array<{ txHash: `0x${string}`; depositId: string }> = [];
  for (const log of logs) {
    const to = (log.args.to as `0x${string}`).toLowerCase();
    if (!pendingSet.has(to)) continue;
    try {
      const result = await confirmTransfer(
        {
          txHash: log.transactionHash!,
          to: log.args.to as `0x${string}`,
          value: log.args.value as bigint,
        },
        chain.id,
      );
      if (result.confirmed && result.depositId) {
        confirmed += 1;
        matched.push({ txHash: log.transactionHash!, depositId: result.depositId });
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

  // Activity logs run outside the per-log transaction so a logging
  // failure cannot roll back the credit.
  for (const m of matched) {
    const [row] = await db
      .select({ userId: deposits.userId, amountMicroUsdc: deposits.amountMicroUsdc, chainId: deposits.chainId })
      .from(deposits)
      .where(eq(deposits.id, m.depositId))
      .limit(1);
    if (!row) continue;
    await logActivity(row.userId, "deposit_auto_confirmed", {
      depositId: m.depositId,
      chainId: row.chainId,
      amountUsdc: microToUsdc(row.amountMicroUsdc),
      txHash: m.txHash,
    });
  }

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

/** Walk every verifiable EVM chain in turn. A failure on one chain does
 *  not stop the others — they are independent RPCs and independent
 *  cursors. The cron route just reports the aggregate. */
export const runDepositWatch = async (): Promise<DepositWatchReport> => {
  const verifiable = CHAINS.filter(isVerifiable);
  const results: DepositWatchReport["chains"] = [];
  for (const chain of verifiable) {
    try {
      results.push(await scanChain(chain));
    } catch (error) {
      console.error("[deposits-watch] chain scan failed", {
        chainId: chain.id,
        error,
      });
      // Still record a zero-confirmed entry so the caller sees the
      // chain was attempted, and leave the cursor at its prior value
      // so the next tick retries from the same starting block.
      results.push({ chainId: chain.id, fromBlock: 0, toBlock: 0, confirmed: 0 });
    }
  }
  const totalConfirmed = results.reduce((acc, r) => acc + r.confirmed, 0);
  return { chains: results, totalConfirmed };
};