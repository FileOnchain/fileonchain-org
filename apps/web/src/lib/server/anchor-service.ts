import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getChain, isValidCID, type ChainId } from "@fileonchain/sdk";
import { db, byokKeys, uploadJobs, organizationMembers } from "@/lib/db";
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
import { enforceAnchorQuota } from "@/lib/server/quotas";
import { enqueueWebhookDeliveries } from "@/lib/server/webhooks";
import { getProjectOrgId } from "@/lib/server/projects";
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
  /** Originating platform id carried in the anchor payload (attribution
   * only); defaults to the server's ANCHOR_PLATFORM_ID (FileOnChain = "1"). */
  platformId?: string;
  /** Optional project tenancy — when set, the job lives under the
   *  project's quota counters; org/personal jobs leave it null. */
  projectId?: string;
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
  // Quota check first so over-cap requests never hit the workers, the
  // credits ledger, or the chain senders. Re-thrown as
  // `AnchorRequestError(402)` because the API contracts here use 402 for
  // credit/quota issues (the route layer also recognizes it).
  try {
    await enforceAnchorQuota(payload.projectId ?? null, payload.fileSizeBytes);
  } catch (error) {
    if (error instanceof Error && error.name === "HttpError") {
      throw new AnchorRequestError(
        (error as Error).message,
        402,
      );
    }
    throw error;
  }

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
      projectId: payload.projectId ?? null,
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
  const [finished] = await db
    .update(uploadJobs)
    .set({
      status: "complete",
      txHashes: workerResult.txs,
      completedAt: new Date(),
      platformId: payload.platformId ?? null,
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

  // Webhook fan-out — `anchor.job.settled` replaces the
  // `/api/v1/anchor/[id]` polling endpoint for org-scoped consumers.
  // The org is resolved through the project (when present) or the user's
  // first org membership — `enqueueWebhookDeliveries` no-ops when no
  // endpoint subscribes, so the lookup is best-effort.
  void (async () => {
    let orgId: string | null = null;
    if (finished.projectId) {
      orgId = await getProjectOrgId(finished.projectId);
    }
    if (!orgId) {
      const [m] = await db
        .select({ orgId: organizationMembers.orgId })
        .from(organizationMembers)
        .where(eq(organizationMembers.userId, ctx.userId))
        .limit(1);
      orgId = m?.orgId ?? null;
    }
    if (!orgId) return;
    await enqueueWebhookDeliveries(orgId, "anchor.job.settled", finished.id, {
      jobId: finished.id,
      status: finished.status,
      cid: finished.cid,
      chainIds: finished.chainIds,
      paymentMethod: finished.paymentMethod,
      projectId: finished.projectId,
      txHashes: finished.txHashes,
      settledAt: finished.completedAt?.toISOString() ?? new Date().toISOString(),
    });
  })();

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
  createdAt: job.createdAt.toISOString(),
  completedAt: job.completedAt?.toISOString() ?? null,
});
