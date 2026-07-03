import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, creditLedger, type CreditReason } from "@/lib/db";

export class InsufficientCreditsError extends Error {
  constructor(balance: bigint, required: bigint) {
    super(
      `Insufficient credits: balance ${balance} µUSDC, required ${required} µUSDC`,
    );
    this.name = "InsufficientCreditsError";
  }
}

interface LedgerRef {
  type: string;
  id: string;
}

/** Append a positive ledger entry (deposits, refunds, adjustments). */
export const creditAccount = async (
  userId: string,
  amountMicroUsdc: bigint,
  reason: CreditReason,
  ref?: LedgerRef,
): Promise<void> => {
  if (amountMicroUsdc <= 0n) throw new Error("Credit amount must be positive");
  await db.insert(creditLedger).values({
    userId,
    deltaMicroUsdc: amountMicroUsdc,
    reason,
    refType: ref?.type,
    refId: ref?.id,
  });
};

/**
 * Debit the account, failing with InsufficientCreditsError when the balance
 * doesn't cover it. Runs in an interactive transaction that takes a lock on
 * the user's ledger rows via an advisory lock keyed on the user id, so two
 * concurrent debits can't both pass the balance check.
 */
export const debitCredits = async (
  userId: string,
  amountMicroUsdc: bigint,
  reason: CreditReason,
  ref?: LedgerRef,
): Promise<void> => {
  if (amountMicroUsdc <= 0n) throw new Error("Debit amount must be positive");
  await db.transaction(async (tx) => {
    // Serialize per-user balance checks; hashtext keeps the key in int range.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${userId}))`,
    );
    const [row] = await tx
      .select({
        balance: sql<string>`coalesce(sum(${creditLedger.deltaMicroUsdc}), 0)`,
      })
      .from(creditLedger)
      .where(eq(creditLedger.userId, userId));
    const balance = BigInt(row?.balance ?? 0);
    if (balance < amountMicroUsdc) {
      throw new InsufficientCreditsError(balance, amountMicroUsdc);
    }
    await tx.insert(creditLedger).values({
      userId,
      deltaMicroUsdc: -amountMicroUsdc,
      reason,
      refType: ref?.type,
      refId: ref?.id,
    });
  });
};
