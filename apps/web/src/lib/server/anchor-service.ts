import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getChain, isValidCID, type ChainId } from "@fileonchain/sdk";
import { db, byokKeys, uploadJobs } from "@/lib/db";
import {
  getChainCostEstimates,
  totalCostFor,
} from "@/lib/mock/costs";
import { getByokProvider } from "@/lib/byok/providers";
import {
  creditAccount,
  debitCredits,
  InsufficientCreditsError,
} from "@/lib/server/credits";
import { logActivity } from "@/lib/server/activity";
import { runAnchorWorker } from "@/lib/server/anchor-worker";
import { getUserRpcOverrides } from "@/lib/server/rpc-endpoints";
import { microToUsdc } from "@/lib/usdc";

export class AnchorRequestError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "AnchorRequestError";
  }
}

export interface AnchorPayload {
  cid: string;
  fileName: string;
  fileSizeBytes: number;
  chunkCount: number;
  chainIds: ChainId[];
  paymentMethod: "credits" | "byok";
  byokKeyId?: string;
  /** Originating platform id for the propose/verify fee split; defaults to
   * the server's ANCHOR_PLATFORM_ID (FileOnChain = "1"). Partner API keys
   * pass their registered platform id to receive the platform share. */
  platformId?: string;
}

const MAX_CHUNKS = 100_000;

/** Validate an anchor request body from the app or the v1 API. */
export const parseAnchorPayload = (body: unknown): AnchorPayload => {
  const value = (body ?? {}) as Record<string, unknown>;
  const {
    cid,
    fileName,
    fileSizeBytes,
    chunkCount,
    chainIds,
    paymentMethod,
    byokKeyId,
    platformId,
  } = value;

  if (typeof cid !== "string" || !isValidCID(cid)) {
    throw new AnchorRequestError("cid must be a CIDv1 base32 string");
  }
  if (typeof fileName !== "string" || !fileName) {
    throw new AnchorRequestError("fileName is required");
  }
  if (
    typeof fileSizeBytes !== "number" ||
    !Number.isInteger(fileSizeBytes) ||
    fileSizeBytes <= 0
  ) {
    throw new AnchorRequestError("fileSizeBytes must be a positive integer");
  }
  if (
    typeof chunkCount !== "number" ||
    !Number.isInteger(chunkCount) ||
    chunkCount <= 0 ||
    chunkCount > MAX_CHUNKS
  ) {
    throw new AnchorRequestError(
      `chunkCount must be an integer in [1, ${MAX_CHUNKS}]`,
    );
  }
  if (!Array.isArray(chainIds) || chainIds.length === 0) {
    throw new AnchorRequestError("chainIds must be a non-empty array");
  }
  for (const chainId of chainIds) {
    const chain = typeof chainId === "string" ? getChain(chainId as ChainId) : undefined;
    if (!chain) {
      throw new AnchorRequestError(`Unknown chain id: ${String(chainId)}`);
    }
    if (chain.status !== "active") {
      throw new AnchorRequestError(
        `Chain ${chain.id} is ${chain.status} and not open for anchoring`,
      );
    }
  }
  if (paymentMethod !== "credits" && paymentMethod !== "byok") {
    throw new AnchorRequestError('paymentMethod must be "credits" or "byok"');
  }
  if (paymentMethod === "byok" && typeof byokKeyId !== "string") {
    throw new AnchorRequestError("byokKeyId is required for BYOK payment");
  }
  if (platformId !== undefined && (typeof platformId !== "string" || !/^[0-9]+$/.test(platformId))) {
    throw new AnchorRequestError("platformId must be a numeric string");
  }

  return {
    cid,
    fileName,
    fileSizeBytes,
    chunkCount,
    chainIds: chainIds as ChainId[],
    paymentMethod,
    byokKeyId: typeof byokKeyId === "string" ? byokKeyId : undefined,
    platformId: typeof platformId === "string" ? platformId : undefined,
  };
};

/** Server-side cost: the same per-chunk estimates the upload UI shows. */
export const computeAnchorCostMicroUsdc = (
  chainIds: ChainId[],
  chunkCount: number,
): bigint => {
  const estimates = getChainCostEstimates();
  let usd = 0;
  for (const chainId of chainIds) {
    const estimate = estimates.find((e) => e.chainId === chainId);
    if (estimate) usd += totalCostFor(estimate, chunkCount).usd;
  }
  return BigInt(Math.ceil(usd * 1_000_000));
};

interface AnchorContext {
  userId: string;
  apiKeyId?: string;
  source: "app" | "api";
}

/**
 * The credits/BYOK anchor flow shared by POST /api/uploads (session) and
 * POST /api/v1/anchor (API key): price the job server-side, debit credits
 * (or resolve the BYOK key), then run the mock anchor worker and finalize
 * the job row with per-chain results.
 */
export const anchorWithAccount = async (
  ctx: AnchorContext,
  payload: AnchorPayload,
) => {
  let byokKeyId: string | undefined;
  if (payload.paymentMethod === "byok") {
    const [key] = await db
      .select()
      .from(byokKeys)
      .where(
        and(
          eq(byokKeys.id, payload.byokKeyId ?? ""),
          eq(byokKeys.userId, ctx.userId),
          isNull(byokKeys.revokedAt),
        ),
      )
      .limit(1);
    if (!key) throw new AnchorRequestError("BYOK key not found", 404);
    if (key.status === "invalid") {
      throw new AnchorRequestError("BYOK key failed validation", 409);
    }
    const provider = getByokProvider(key.provider);
    const unsupported = payload.chainIds.filter(
      (chainId) => !provider?.chainIds.includes(chainId),
    );
    if (unsupported.length > 0) {
      throw new AnchorRequestError(
        `${provider?.name ?? key.provider} cannot anchor on: ${unsupported.join(", ")}`,
      );
    }
    byokKeyId = key.id;
  }

  const cost =
    payload.paymentMethod === "credits"
      ? computeAnchorCostMicroUsdc(payload.chainIds, payload.chunkCount)
      : 0n; // BYOK spends the user's provider credit, not platform credits.

  const [job] = await db
    .insert(uploadJobs)
    .values({
      userId: ctx.userId,
      apiKeyId: ctx.apiKeyId,
      byokKeyId,
      cid: payload.cid,
      fileName: payload.fileName,
      fileSizeBytes: payload.fileSizeBytes,
      chunkCount: payload.chunkCount,
      chainIds: payload.chainIds,
      paymentMethod: payload.paymentMethod,
      costMicroUsdc: cost,
      txHashes: [],
    })
    .returning();

  if (cost > 0n) {
    try {
      await debitCredits(ctx.userId, cost, "anchor_debit", {
        type: "upload_job",
        id: job.id,
      });
    } catch (error) {
      await db
        .update(uploadJobs)
        .set({ status: "failed" })
        .where(eq(uploadJobs.id, job.id));
      if (error instanceof InsufficientCreditsError) {
        throw new AnchorRequestError(
          "Insufficient credits — top up on the Credits tab",
          402,
        );
      }
      throw error;
    }
    await logActivity(ctx.userId, "credit_debit", {
      jobId: job.id,
      amountUsdc: microToUsdc(cost),
    });
  }

  let workerResult: Awaited<ReturnType<typeof runAnchorWorker>>;
  try {
    const rpcOverrides = await getUserRpcOverrides(ctx.userId);
    workerResult = await runAnchorWorker(
      job.id,
      payload.cid,
      payload.chainIds,
      rpcOverrides,
      payload.platformId,
    );
  } catch (error) {
    // A configured on-chain send failed — fail the job and give the
    // credits back rather than leaving a debit with nothing anchored.
    await db
      .update(uploadJobs)
      .set({ status: "failed" })
      .where(eq(uploadJobs.id, job.id));
    if (cost > 0n) {
      await creditAccount(ctx.userId, cost, "refund", {
        type: "upload_job",
        id: job.id,
      });
    }
    console.error(`Anchor worker failed for job ${job.id}:`, error);
    throw new AnchorRequestError("On-chain anchoring failed — try again", 502);
  }
  // The job is complete once the anchors landed; on-chain verification
  // settles later — "proposed" anchors verify after their challenge window
  // (permissionless finalize; a keeper cron is the follow-up).
  const [finished] = await db
    .update(uploadJobs)
    .set({
      status: "complete",
      txHashes: workerResult.txs,
      completedAt: new Date(),
      verificationStatus: workerResult.verification.status,
      challengeDeadlineAt: workerResult.verification.challengeDeadlineAt,
      platformId: workerResult.verification.platformId,
    })
    .where(eq(uploadJobs.id, job.id))
    .returning();

  await logActivity(ctx.userId, "upload_anchor", {
    jobId: job.id,
    cid: payload.cid,
    chains: payload.chainIds.join(","),
    chunkCount: payload.chunkCount,
    paymentMethod: payload.paymentMethod,
    source: ctx.source,
  });
  if (ctx.source === "api") {
    await logActivity(ctx.userId, "api_call", {
      endpoint: "/api/v1/anchor",
      jobId: job.id,
    });
  }

  return finished;
};

/** JSON shape shared by the session and v1 job endpoints. */
export const serializeJob = (job: typeof uploadJobs.$inferSelect) => ({
  id: job.id,
  cid: job.cid,
  fileName: job.fileName,
  fileSizeBytes: job.fileSizeBytes,
  chunkCount: job.chunkCount,
  chainIds: job.chainIds,
  paymentMethod: job.paymentMethod,
  status: job.status,
  costMicroUsdc: job.costMicroUsdc.toString(),
  txHashes: job.txHashes,
  verification: {
    status: job.verificationStatus,
    challengeDeadline: job.challengeDeadlineAt?.toISOString() ?? null,
    platformId: job.platformId,
  },
  createdAt: job.createdAt.toISOString(),
  completedAt: job.completedAt?.toISOString() ?? null,
});
