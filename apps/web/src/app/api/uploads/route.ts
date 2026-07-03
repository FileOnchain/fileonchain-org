import { NextResponse } from "next/server";
import { requireUser, asRouteError } from "@/lib/auth";
import {
  anchorWithAccount,
  parseAnchorPayload,
  serializeJob,
  AnchorRequestError,
} from "@/lib/server/anchor-service";

/** Credits/BYOK anchor for the signed-in app user. */
export async function POST(request: Request) {
  try {
    const userId = await requireUser();
    const body = await request.json().catch(() => null);
    const payload = parseAnchorPayload(body);
    const job = await anchorWithAccount({ userId, source: "app" }, payload);
    return NextResponse.json({ job: serializeJob(job) });
  } catch (error) {
    if (error instanceof AnchorRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return asRouteError(error);
  }
}
