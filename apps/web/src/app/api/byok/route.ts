import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, byokKeys } from "@/lib/db";
import { requireUser, asRouteError } from "@/lib/auth";
import { isByokProvider } from "@/lib/byok/providers";
import { serializeByokKey, validateProviderKey } from "@/lib/server/byok";
import { sealSecret } from "@/lib/crypto/secretbox";
import { logActivity } from "@/lib/server/activity";

export async function GET() {
  try {
    const userId = await requireUser();
    const keys = await db
      .select()
      .from(byokKeys)
      .where(eq(byokKeys.userId, userId))
      .orderBy(desc(byokKeys.createdAt));
    return NextResponse.json({ keys: keys.map(serializeByokKey) });
  } catch (error) {
    return asRouteError(error);
  }
}

/** Store a provider key: mock-validate, encrypt at rest, keep only a preview. */
export async function POST(request: Request) {
  try {
    const userId = await requireUser();
    const body = (await request.json().catch(() => null)) as {
      provider?: unknown;
      label?: unknown;
      key?: unknown;
    } | null;

    const provider = body?.provider;
    const label = typeof body?.label === "string" ? body.label.trim() : "";
    const key = typeof body?.key === "string" ? body.key.trim() : "";
    if (!isByokProvider(provider) || !label || label.length > 64) {
      return NextResponse.json(
        { error: "Expected { provider, label (1–64 chars), key }" },
        { status: 400 },
      );
    }
    if (key.length < 8 || key.length > 512) {
      return NextResponse.json(
        { error: "key must be 8–512 characters" },
        { status: 400 },
      );
    }

    const status = await validateProviderKey(provider, key);
    const [row] = await db
      .insert(byokKeys)
      .values({
        userId,
        provider,
        label,
        encryptedKey: sealSecret(key),
        keyPreview: key.slice(-4),
        status,
        lastValidatedAt: new Date(),
      })
      .returning();

    await logActivity(userId, "byok_added", {
      byokKeyId: row.id,
      provider,
      label,
      status,
    });
    return NextResponse.json({ key: serializeByokKey(row) });
  } catch (error) {
    return asRouteError(error);
  }
}
