import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, byokKeys } from "@/lib/db";
import { requireUser, asRouteError } from "@/lib/auth";
import { serializeByokKey, validateProviderKey } from "@/lib/server/byok";
import { openSecret } from "@/lib/crypto/secretbox";

/** Re-run (mock) provider validation against the stored key. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUser();
    const { id } = await params;
    const [key] = await db
      .select()
      .from(byokKeys)
      .where(
        and(
          eq(byokKeys.id, id),
          eq(byokKeys.userId, userId),
          isNull(byokKeys.revokedAt),
        ),
      )
      .limit(1);
    if (!key) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    const status = await validateProviderKey(
      key.provider,
      openSecret(key.encryptedKey),
    );
    const [updated] = await db
      .update(byokKeys)
      .set({ status, lastValidatedAt: new Date() })
      .where(eq(byokKeys.id, key.id))
      .returning();
    return NextResponse.json({ key: serializeByokKey(updated) });
  } catch (error) {
    return asRouteError(error);
  }
}
