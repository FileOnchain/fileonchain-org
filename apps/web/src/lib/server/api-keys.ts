import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, apiKeys } from "@/lib/db";

/**
 * API keys look like `fok_<32 base64url chars>`. Only the SHA-256 hash is
 * stored — the plaintext is returned exactly once at creation.
 */

const hashKey = (secret: string): string =>
  createHash("sha256").update(secret).digest("hex");

export const createApiKey = async (userId: string, name: string) => {
  const secret = `fok_${randomBytes(24).toString("base64url")}`;
  const [row] = await db
    .insert(apiKeys)
    .values({
      userId,
      name,
      prefix: secret.slice(0, 12),
      keyHash: hashKey(secret),
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
