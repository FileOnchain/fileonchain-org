import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { authenticateApiKey } from "@/lib/server/api-keys";
import { asRouteError } from "@/lib/auth";
import {
  CLOUD_EXPORTS_DISABLED_BODY,
  isCloudExportsEnabled,
} from "@/lib/server/cloud-feature";
import { authorizeDownload } from "@/lib/server/exports";
import { logActivity } from "@/lib/server/activity";

/**
 * `GET /api/v1/exports/[id]/download?token=…` — streams the TAR
 * archive. Authentication is the org-scoped API key (Bearer) plus the
 * token in the query string (the same token was returned to the
 * caller once when the job was created).
 *
 * Streaming uses Node `Readable.from` over a `createReadStream` so the
 * response can be a `Response` with a `ReadableStream` body — the
 * framework handles backpressure end-to-end.
 */

const isNonEmptyString = (s: unknown): s is string =>
  typeof s === "string" && s.length > 0;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isCloudExportsEnabled()) {
    return NextResponse.json(CLOUD_EXPORTS_DISABLED_BODY, { status: 503 });
  }
  const apiKey = await authenticateApiKey(request);
  if (!apiKey || !apiKey.orgId) {
    return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token") ?? "";
    if (!isNonEmptyString(token)) {
      return NextResponse.json(
        { error: "Missing ?token=…" },
        { status: 400 },
      );
    }
    const { id } = await params;
    const row = await authorizeDownload(id, token, apiKey.orgId);
    if (!row.filePath) {
      return NextResponse.json({ error: "Export not ready" }, { status: 409 });
    }
    const stream = createReadStream(row.filePath);
    await logActivity(apiKey.userId, "export_downloaded", {
      exportId: row.id,
    });
    const webStream = new ReadableStream<Uint8Array>({
      start(controller) {
        stream.on("data", (chunk: Buffer | string) => {
          const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
          controller.enqueue(new Uint8Array(buf));
        });
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
      },
      cancel() {
        stream.destroy();
      },
    });
    return new Response(webStream, {
      status: 200,
      headers: {
        "content-type": "application/x-tar",
        "content-disposition": `attachment; filename="evidence-export-${row.id}.tar"`,
      },
    });
  } catch (error) {
    return asRouteError(error);
  }
}
