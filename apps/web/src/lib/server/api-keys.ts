import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  apiKeys,
  organizationMembers,
  projectMembers,
} from "@/lib/db";
import { HttpError } from "@/lib/server/http-error";
import {
  enforceApiKeyRateLimit,
  enforceIpRateLimit,
  endpointKey,
  clientIp,
} from "@/lib/server/rate-limit";

/**
 * API keys look like `fok_<32 base64url chars>`. Only the SHA-256 hash is
 * stored — the plaintext is returned exactly once at creation.
 *
 * Optional `orgId` produces an org-scoped key: `scope = "org"`,
 * `orgId = <org>`. Org-scoped keys are required by the Cloud evidence
 * surface (`/api/v1/evidence`, `/api/v1/agent-runs`, `/api/v1/verify`,
 * `/api/v1/retention`). Personal keys (`scope = "personal"`,
 * `orgId = NULL`) keep their existing behavior for `/api/v1/anchor` and
 * `/api/v1/credits`.
 */

const hashKey = (secret: string): string =>
  createHash("sha256").update(secret).digest("hex");

/**
 * Verify that the user is a member of `orgId`. Returns the role, or throws
 * `forbidden` (403) when the user has no membership row. Used by the keys
 * issuance path so a user cannot mint a key against an org they don't
 * belong to.
 */
const assertOrgMembership = async (
  userId: string,
  orgId: string,
): Promise<void> => {
  const [row] = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.orgId, orgId),
        eq(organizationMembers.userId, userId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new HttpError(
      403,
      "You are not a member of that organization",
      "forbidden",
    );
  }
};

/**
 * Verify that the user is a project member. Project scope implies org
 * scope; we re-check org membership so a user that has been removed from
 * the org can no longer seal into the project.
 */
const assertProjectMembership = async (
  userId: string,
  projectId: string,
): Promise<void> => {
  const [row] = await db
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new HttpError(
      403,
      "You are not a member of that project",
      "forbidden",
    );
  }
};

export interface ApiKeyInput {
  userId: string;
  name: string;
  orgId?: string | null;
  projectId?: string | null;
}

export const createApiKey = async ({
  userId,
  name,
  orgId = null,
  projectId = null,
}: ApiKeyInput) => {
  if (orgId) await assertOrgMembership(userId, orgId);
  if (projectId) {
    if (!orgId) {
      throw new HttpError(
        400,
        "project-scoped keys require an orgId",
        "bad_request",
      );
    }
    await assertProjectMembership(userId, projectId);
  }
  const scope =
    projectId && orgId
      ? "project"
      : orgId
        ? "org"
        : "personal";
  const secret = `fok_${randomBytes(24).toString("base64url")}`;
  const [row] = await db
    .insert(apiKeys)
    .values({
      userId,
      name,
      prefix: secret.slice(0, 12),
      keyHash: hashKey(secret),
      orgId,
      projectId: scope === "project" ? projectId : null,
      scope,
    })
    .returning();
  return { secret, apiKey: row };
};

export const revokeApiKey = async (userId: string, id: string) => {
  const [row] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiKeys.id, id),
        eq(apiKeys.userId, userId),
        isNull(apiKeys.revokedAt),
      ),
    )
    .returning();
  return row ?? null;
};

/**
 * Resolve `Authorization: Bearer fok_…` to an active API key row (bumping
 * lastUsedAt + enforcing the per-API-key + per-IP rate limit), or null.
 *
 * The IP bucket is checked even when the caller omits or sends a wrong
 * key, so unauthenticated abuse is bounded before it reaches the service
 * layer. The API-key bucket is only consulted after a valid key resolves
 * — the per-IP cap covers the unauthenticated case without needing a
 * dedicated anonymous counter.
 */
export const authenticateApiKey = async (request: Request) => {
  const endpoint = endpointKey(request);

  // IP bucket runs unconditionally so anonymous traffic is bounded.
  // Skip the call only when the caller's Authorization header matches
  // the API-key shape — the per-IP bucket still applies below when a
  // valid key resolves.
  await enforceIpRateLimit(clientIp(request), endpoint);

  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer fok_")) return null;
  const secret = header.slice("Bearer ".length).trim();

  const [row] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hashKey(secret)), isNull(apiKeys.revokedAt)))
    .limit(1);
  if (!row) return null;

  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id));

  // Per-key bucket — throws HttpError(429, "rate_limited") when over the
  // endpoint's cap. The thrown error propagates to the route's
  // `asRouteError(error)` catch with the standard `{ error, code }` shape.
  await enforceApiKeyRateLimit(row.id, endpoint);
  return row;
};
