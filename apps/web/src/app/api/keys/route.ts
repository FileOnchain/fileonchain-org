import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, apiKeys } from "@/lib/db";
import { requireUser, asRouteError } from "@/lib/auth";
import { createApiKey } from "@/lib/server/api-keys";
import { logActivity } from "@/lib/server/activity";

const serialize = (key: typeof apiKeys.$inferSelect) => ({
  id: key.id,
  name: key.name,
  prefix: key.prefix,
  orgId: key.orgId,
  projectId: key.projectId,
  scope: key.scope,
  lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
  revokedAt: key.revokedAt?.toISOString() ?? null,
  createdAt: key.createdAt.toISOString(),
});

export async function GET() {
  try {
    const userId = await requireUser();
    const keys = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId))
      .orderBy(desc(apiKeys.createdAt));
    return NextResponse.json({ keys: keys.map(serialize) });
  } catch (error) {
    return asRouteError(error);
  }
}

/** Create a key. The plaintext secret appears in this response only.
 *
 *  Body: `{ name, orgId?, projectId? }`. The three scopes compose:
 *   - no orgId + no projectId → personal key
 *   - orgId + no projectId     → org-scoped key
 *   - orgId + projectId        → project-scoped key
 *
 *  Project-scoped keys also require the project member to be an org
 *  member (the project view filters down from the org); membership is
 *  re-checked inside `createApiKey` so a stale session cannot mint into
 *  a project the user has been removed from.
 */
export async function POST(request: Request) {
  try {
    const userId = await requireUser();
    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      orgId?: unknown;
      projectId?: unknown;
    } | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 64) {
      return NextResponse.json(
        { error: "Expected { name } (1–64 chars)" },
        { status: 400 },
      );
    }
    const orgId =
      typeof body?.orgId === "string" && body.orgId.length > 0
        ? body.orgId
        : null;
    const projectId =
      typeof body?.projectId === "string" && body.projectId.length > 0
        ? body.projectId
        : null;

    const { secret, apiKey } = await createApiKey({
      userId,
      name,
      orgId,
      projectId,
    });
    await logActivity(userId, "api_key_created", {
      keyId: apiKey.id,
      name,
      prefix: apiKey.prefix,
      scope: apiKey.scope,
      orgId: apiKey.orgId,
      projectId: apiKey.projectId,
    });
    return NextResponse.json({ key: serialize(apiKey), secret });
  } catch (error) {
    return asRouteError(error);
  }
}
