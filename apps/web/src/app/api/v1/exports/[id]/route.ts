import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/server/api-keys";
import { asRouteError } from "@/lib/auth";
import {
  CLOUD_EXPORTS_DISABLED_BODY,
  isCloudExportsEnabled,
} from "@/lib/server/cloud-feature";
import {
  getExportJob,
  purgeExportJob,
} from "@/lib/server/exports";

/**
 * `GET   /api/v1/exports/[id]`           job status (no file bytes)
 * `DELETE /api/v1/exports/[id]`          cancel a still-pending job, or
 *                                         purge a ready/expired one
 * `GET   /api/v1/exports/[id]/download?token=…` — streams the tar
 *                                         (sibling route file)
 *
 * The download token is never returned by this route — only by the
 * create response implicitly (the row gets one stamped, and the URL is
 * reconstructed by the UI from the id + token it received at create).
 */

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
    const { id } = await params;
    const row = await getExportJob(apiKey.orgId, id);
    return NextResponse.json({
      job: {
        id: row.id,
        status: row.status,
        envelopeCount: row.envelopeCount,
        byteSize: row.byteSize,
        projectId: row.projectId,
        includeAgentRunIndex: row.includeAgentRunIndex,
        filter: row.filter,
        expiresAt: row.expiresAt?.toISOString() ?? null,
        completedAt: row.completedAt?.toISOString() ?? null,
        error: row.error,
        createdAt: row.createdAt.toISOString(),
        // token is shown by the create response, never re-shown —
        // rotation requires a new export.
      },
    });
  } catch (error) {
    return asRouteError(error);
  }
}

export async function DELETE(
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
    const { id } = await params;
    const row = await getExportJob(apiKey.orgId, id);
    if (row.status === "pending" || row.status === "building") {
      // The async build runs without observing a cancellation flag;
      // the build will simply overwrite the row's status to ready or
      // failed. We don't try to interrupt the in-flight loop.
      await purgeExportJob(row.id);
    } else if (row.status === "ready" || row.status === "expired") {
      await purgeExportJob(row.id);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return asRouteError(error);
  }
}
