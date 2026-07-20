import "server-only";
import { sql } from "drizzle-orm";
import {
  db,
  rateLimitWindows,
  type RateLimitScope,
} from "@/lib/db";
import { HttpError } from "@/lib/server/http-error";
import { env } from "@/lib/env";

/**
 * Sliding-minute rate limits for the `/api/v1/*` API-key surface. The
 * counters live in `rate_limit_window` (one row per
 * `(scope_kind, scope_id, endpoint, window_start)` tuple, window = 1
 * minute). The atomic UPSERT bumps the counter and returns the new
 * value in a single round trip; the throw on overflow reuses the
 * `HttpError(429, …, "rate_limited")` shape every v1 route already
 * unwraps via `asRouteError`.
 *
 * Why Postgres and not in-memory: a per-route `Map` works for a single
 * Vercel function instance but undercounts the moment the surface runs
 * across more than one region or instance. The DB UPSERT is global and
 * `O(1)` thanks to the unique index.
 *
 * Why a 60-second window: long enough to absorb bursty retries, short
 * enough that a noisy tenant does not starve a quiet one for hours.
 * Window length is fixed for v1; per-scope override knobs live in env
 * so ops can dial limits without redeploying.
 */

const WINDOW_MS = 60_000;

/** Default per-minute caps; each can be overridden by env. */
const DEFAULT_LIMITS = {
  apiKeyPerMin: 600,
  apiKeyAnchorPerMin: 60,
  apiKeyEvidencePerMin: 120,
  ipPerMin: 60,
} as const;

/** Which endpoint matches which cap. Anything not matched falls back to
 *  `apiKeyPerMin` / `ipPerMin`. Keep this list aligned with `/api/v1/*`
 *  routes that mutate Cloud state. */
const ENDPOINT_OVERRIDES: Record<string, "anchor" | "evidence"> = {
  "POST /api/v1/anchor": "anchor",
  "POST /api/v1/evidence": "evidence",
  "POST /api/v1/agent-runs": "evidence",
};

const apiKeyLimitFor = (endpoint: string): number => {
  const override = ENDPOINT_OVERRIDES[endpoint];
  if (override === "anchor") {
    return Number(env.rateLimitV1AnchorPerMin) || DEFAULT_LIMITS.apiKeyAnchorPerMin;
  }
  if (override === "evidence") {
    return Number(env.rateLimitV1EvidencePerMin) ||
      DEFAULT_LIMITS.apiKeyEvidencePerMin;
  }
  return Number(env.rateLimitV1PerMin) || DEFAULT_LIMITS.apiKeyPerMin;
};

const ipLimitFor = (): number =>
  Number(env.rateLimitV1IpPerMin) || DEFAULT_LIMITS.ipPerMin;

/** Build the stable endpoint key the limit bucket keys on. Path params
 *  are normalized to `[id]` so `GET /api/v1/anchor/abc` and
 *  `GET /api/v1/anchor/def` share the same bucket — fragmenting by id
 *  would let a noisy caller dodge the limit by varying the id. */
export const endpointKey = (request: Request): string => {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean).map((seg) =>
    /^[0-9a-f]{8,}$|^[A-Za-z0-9_-]{20,}$/.test(seg) ? "[id]" : seg,
  );
  const normalized = "/" + segments.join("/");
  return `${request.method} ${normalized}`;
};

/** Best-effort client IP. Vercel sets `x-forwarded-for` with the real
 *  IP in the first hop; fall back to `x-real-ip` (also set by Vercel's
 *  edge), then to a sentinel so the IP bucket still gets one row per
 *  anonymous request instead of a single global row. */
export const clientIp = (request: Request): string => {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
};

/** Floor `Date.now()` to the start of the current minute. Postgres-side
 *  we let `date_trunc` do the same so the two windows match. */
const windowStart = (now: Date): Date =>
  new Date(Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS);

interface UpsertResult {
  count: number;
  limit: number;
  resetAt: Date;
}

/**
 * Atomic UPSERT + threshold check. One round trip:
 *   INSERT … ON CONFLICT … DO UPDATE SET request_count = request_count + 1
 *   RETURNING request_count
 * Throws `HttpError(429, …, "rate_limited")` when the post-increment
 * count exceeds `limit`.
 */
const bumpAndCheck = async (
  scopeKind: RateLimitScope,
  scopeId: string,
  endpoint: string,
  limit: number,
): Promise<UpsertResult> => {
  const ws = windowStart(new Date());
  const resetAt = new Date(ws.getTime() + WINDOW_MS);
  const rows = await db.execute<{ request_count: number }>(sql`
    INSERT INTO "rate_limit_window"
      ("id","scope_kind","scope_id","endpoint","window_start","request_count","created_at")
    VALUES (${crypto.randomUUID()}, ${scopeKind}, ${scopeId}, ${endpoint}, ${ws}, 1, now())
    ON CONFLICT ("scope_kind","scope_id","endpoint","window_start")
      DO UPDATE SET "request_count" = "rate_limit_window"."request_count" + 1
    RETURNING "request_count"
  `);
  const count = Number(rows.rows[0]?.request_count ?? 0);
  if (count > limit) {
    throw new HttpError(
      429,
      `Rate limit exceeded (${limit}/min on ${endpoint})`,
      "rate_limited",
    );
  }
  return { count, limit, resetAt };
};

/** Enforce the per-API-key bucket. Called from `authenticateApiKey`
 *  after the key row is resolved and `lastUsedAt` is bumped. */
export const enforceApiKeyRateLimit = async (
  apiKeyId: string,
  endpoint: string,
): Promise<UpsertResult> => {
  const limit = apiKeyLimitFor(endpoint);
  return bumpAndCheck("api_key", apiKeyId, endpoint, limit);
};

/** Enforce the per-IP bucket — covers both anonymous abuse (wrong or
 *  missing API key) and authenticated callers (defense in depth so one
 *  tenant cannot starve others from the same NAT). */
export const enforceIpRateLimit = async (
  ip: string,
  endpoint: string,
): Promise<UpsertResult> => {
  const limit = ipLimitFor();
  return bumpAndCheck("ip", ip, endpoint, limit);
};

/** Debug-only peek (used by tests / dashboards); does not bump the
 *  counter. Returns null when the window has no row yet. */
export const peekRateLimit = async (
  scopeKind: RateLimitScope,
  scopeId: string,
  endpoint: string,
): Promise<UpsertResult | null> => {
  const ws = windowStart(new Date());
  const [row] = await db
    .select({ requestCount: rateLimitWindows.requestCount })
    .from(rateLimitWindows)
    .where(
      sql`${rateLimitWindows.scopeKind} = ${scopeKind}
          AND ${rateLimitWindows.scopeId} = ${scopeId}
          AND ${rateLimitWindows.endpoint} = ${endpoint}
          AND ${rateLimitWindows.windowStart} = ${ws}`,
    )
    .limit(1);
  if (!row) return null;
  return {
    count: row.requestCount,
    limit:
      scopeKind === "ip" ? ipLimitFor() : apiKeyLimitFor(endpoint),
    resetAt: new Date(ws.getTime() + WINDOW_MS),
  };
};