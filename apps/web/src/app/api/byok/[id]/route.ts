import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, byokKeys } from "@/lib/db";
import { requireUser, asRouteError } from "@/lib/auth";
import { logActivity } from "@/lib/server/activity";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUser();
    const { id } = await params;
    const [row] = await db
      .update(byokKeys)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(byokKeys.id, id),
          eq(byokKeys.userId, userId),
          isNull(byokKeys.revokedAt),
        ),
      )
      .returning();
    if (!row) {
      return NextResponse.json(
        { error: "Key not found or already removed" },
        { status: 404 },
      );
    }
    await logActivity(userId, "byok_removed", {
      byokKeyId: row.id,
      provider: row.provider,
      label: row.label,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return asRouteError(error);
  }
}
