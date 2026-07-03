import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, uploadJobs } from "@/lib/db";
import { authenticateApiKey } from "@/lib/server/api-keys";
import { serializeJob } from "@/lib/server/anchor-service";

/** Job status for programmatic polling. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const apiKey = await authenticateApiKey(request);
  if (!apiKey) {
    return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }
  const { id } = await params;
  const [job] = await db
    .select()
    .from(uploadJobs)
    .where(and(eq(uploadJobs.id, id), eq(uploadJobs.userId, apiKey.userId)))
    .limit(1);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  return NextResponse.json({ job: serializeJob(job) });
}
