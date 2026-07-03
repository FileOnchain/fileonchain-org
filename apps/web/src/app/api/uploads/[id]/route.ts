import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, uploadJobs } from "@/lib/db";
import { requireUser, asRouteError } from "@/lib/auth";
import { serializeJob } from "@/lib/server/anchor-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUser();
    const { id } = await params;
    const [job] = await db
      .select()
      .from(uploadJobs)
      .where(and(eq(uploadJobs.id, id), eq(uploadJobs.userId, userId)))
      .limit(1);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json({ job: serializeJob(job) });
  } catch (error) {
    return asRouteError(error);
  }
}
