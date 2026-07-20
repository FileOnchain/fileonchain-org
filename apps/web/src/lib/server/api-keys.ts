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
 * lastUsedAt), or null.
 *
 * TODO: add rate limiting and request-size limits before real chain spends
 * run behind these keys.
 */
export const authenticateApiKey = async (request: Request) => {
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
  return row;
};
