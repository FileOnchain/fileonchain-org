import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import {
  CHAIN_FAMILIES,
  getChain,
  type ChainFamily,
  type ChainId,
} from "@fileonchain/sdk";
import { auth } from "@/lib/auth";
import { db, byokKeys } from "@/lib/db";
import { getCreditBalance } from "@/lib/server/queries";
import { computeUploadRecommendation } from "@/lib/recommendations/engine";
import { polishRecommendationCopy } from "@/lib/recommendations/llm";
import type {
  RecommendationSessionContext,
  UploadIntent,
  UploadRecommendationRequest,
} from "@/lib/recommendations/types";

/**
 * POST /api/recommendations/upload — the Upload Advisor endpoint.
 *
 * Auth is optional: with a session the server enriches the input with the
 * real credit balance and valid BYOK keys (client-supplied account fields
 * are never trusted); without one the guest path recommends PAYG options.
 * The deterministic rule engine decides; the optional OpenRouter layer only
 * polishes the copy. Clients fall back to running the same engine locally
 * on any non-200, so failures here are never user-visible errors.
 */

/** Mirrors the anchor API's chunk cap (lib/server/anchor-service.ts). */
const MAX_CHUNKS = 100_000;
const MAX_NAME_LENGTH = 200;
const MAX_MIME_LENGTH = 128;

const INTENTS: readonly UploadIntent[] = [
  "testnet",
  "production",
  "lowest_cost",
  "balanced",
];

/**
 * Best-effort per-IP rate limit (30/min guest, 60/min authenticated).
 * In-memory and therefore per-instance — good enough for an advisory
 * endpoint whose fallback is free local computation.
 */
const RATE_WINDOW_MS = 60_000;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

const rateLimited = (key: string, limit: number): boolean => {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    // Opportunistically drop expired buckets so the map can't grow unbounded.
    if (rateBuckets.size > 10_000) {
      for (const [k, v] of rateBuckets) {
        if (v.resetAt <= now) rateBuckets.delete(k);
      }
    }
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
};

const parseRequest = (
  body: unknown,
): UploadRecommendationRequest | { error: string } => {
  const value = (body ?? {}) as Record<string, unknown>;
  const file = (value.file ?? {}) as Record<string, unknown>;
  const wallet = (value.wallet ?? {}) as Record<string, unknown>;

  if (typeof file.name !== "string") {
    return { error: "file.name must be a string" };
  }
  // Basename only — strip any path segments a client may have sent.
  const name =
    file.name.split(/[\\/]/).pop()?.slice(0, MAX_NAME_LENGTH) || "file";

  if (
    typeof file.sizeBytes !== "number" ||
    !Number.isSafeInteger(file.sizeBytes) ||
    file.sizeBytes <= 0
  ) {
    return { error: "file.sizeBytes must be a positive integer" };
  }
  if (typeof file.mimeType !== "string") {
    return { error: "file.mimeType must be a string (may be empty)" };
  }
  if (
    typeof file.chunkCount !== "number" ||
    !Number.isInteger(file.chunkCount) ||
    file.chunkCount < 1 ||
    file.chunkCount > MAX_CHUNKS
  ) {
    return { error: `file.chunkCount must be an integer in [1, ${MAX_CHUNKS}]` };
  }

  if (
    typeof value.activeChainId !== "string" ||
    !getChain(value.activeChainId as ChainId)
  ) {
    return { error: `Unknown chain id: ${String(value.activeChainId)}` };
  }

  if (typeof wallet.connected !== "boolean") {
    return { error: "wallet.connected must be a boolean" };
  }
  const family = wallet.family ?? null;
  if (family !== null && !CHAIN_FAMILIES.includes(family as ChainFamily)) {
    return { error: `Unknown wallet family: ${String(family)}` };
  }

  if (
    value.intent !== undefined &&
    !INTENTS.includes(value.intent as UploadIntent)
  ) {
    return { error: `intent must be one of: ${INTENTS.join(", ")}` };
  }

  return {
    file: {
      name,
      sizeBytes: file.sizeBytes,
      mimeType: file.mimeType.slice(0, MAX_MIME_LENGTH),
      chunkCount: file.chunkCount,
    },
    activeChainId: value.activeChainId as ChainId,
    wallet: {
      connected: wallet.connected,
      family: family as ChainFamily | null,
    },
    intent: value.intent as UploadIntent | undefined,
  };
};

/** Enrich with server-read account state; degrade gracefully without a DB. */
const readSessionContext = async (): Promise<RecommendationSessionContext> => {
  let userId: string | null = null;
  try {
    const session = await auth();
    userId = session?.user?.id ?? null;
  } catch {
    return { authenticated: false, creditBalanceMicroUsdc: null, byokKeys: [] };
  }
  if (!userId) {
    return { authenticated: false, creditBalanceMicroUsdc: null, byokKeys: [] };
  }
  try {
    const [balance, keys] = await Promise.all([
      getCreditBalance(userId),
      db
        .select({
          id: byokKeys.id,
          provider: byokKeys.provider,
          label: byokKeys.label,
        })
        .from(byokKeys)
        .where(
          and(
            eq(byokKeys.userId, userId),
            eq(byokKeys.status, "valid"),
            isNull(byokKeys.revokedAt),
          ),
        ),
    ]);
    return {
      authenticated: true,
      creditBalanceMicroUsdc: balance.toString(),
      byokKeys: keys,
    };
  } catch {
    // Account reads failed — still authenticated, just without balance/keys.
    return { authenticated: true, creditBalanceMicroUsdc: null, byokKeys: [] };
  }
};

export async function POST(request: Request) {
  try {
    const session = await readSessionContext();

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    if (rateLimited(`reco:${ip}`, session.authenticated ? 60 : 30)) {
      return NextResponse.json(
        { error: "Too many requests — slow down" },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = parseRequest(body);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const input = {
      file: parsed.file,
      activeChainId: parsed.activeChainId,
      wallet: parsed.wallet,
      intent: parsed.intent ?? ("balanced" as const),
      session,
    };
    const recommendation = computeUploadRecommendation(input);

    // Optional copy polish — suggested.* stays rule-engine authoritative.
    const copy = await polishRecommendationCopy(input, recommendation);
    if (copy) {
      recommendation.headline = copy.headline;
      recommendation.rationale = copy.rationale;
    }

    return NextResponse.json(recommendation);
  } catch (error) {
    console.error("Upload recommendation failed:", error);
    return NextResponse.json(
      { error: "Recommendation unavailable" },
      { status: 500 },
    );
  }
}
