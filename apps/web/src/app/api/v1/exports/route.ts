import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/server/api-keys";
import { asRouteError } from "@/lib/auth";
import { HttpError } from "@/lib/server/http-error";
import {
  CLOUD_EXPORTS_DISABLED_BODY,
  isCloudExportsEnabled,
} from "@/lib/server/cloud-feature";
import {
  createExportJob,
  listExportJobs,
} from "@/lib/server/exports";
import type { ExportJobFilter } from "@/lib/db";

/**
 * `POST /api/v1/exports` — start a bulk build. Returns the new job id
 * synchronously; the build itself runs in the same process via
 * `queueMicrotask` and the caller can poll status on
 * `GET /api/v1/exports/[id]`.
 *
 * `GET /api/v1/exports` — list recent exports for the org.
 *
 * Auth: org-scoped API key (`scope = "org"` or `scope = "project"`).
 */

const parseFilter = (input: unknown): ExportJobFilter => {
  const obj = (input ?? {}) as Record<string, unknown>;
  const filter: ExportJobFilter = {};
  if (typeof obj.from === "string") filter.from = obj.from;
  if (typeof obj.to === "string") filter.to = obj.to;
  if (typeof obj.profile === "string") filter.profile = obj.profile;
  if (Array.isArray(obj.signerIds)) {
    filter.signerIds = obj.signerIds.filter((s): s is string =>
      typeof s === "string",
    );
  }
  return filter;
};

export async function POST(request: Request) {
  if (!isCloudExportsEnabled()) {
    return NextResponse.json(CLOUD_EXPORTS_DISABLED_BODY, { status: 503 });
  }
  const apiKey = await authenticateApiKey(request);
  if (!apiKey || !apiKey.orgId) {
    return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }
  try {
    const body = (await request.json().catch(() => null)) as {
      project?: unknown;
      projectId?: unknown;
      filter?: unknown;
      includeAgentRunIndex?: unknown;
    } | null;
    const filter = parseFilter(body?.filter);
    const projectIdRaw =
      typeof body?.project === "string"
        ? body.project
        : typeof body?.projectId === "string"
          ? body.projectId
          : null;
    if (projectIdRaw && apiKey.scope === "project" && apiKey.projectId !== projectIdRaw) {
      throw new HttpError(
        400,
        "project-scoped API keys can only export their own project",
        "bad_request",
      );
    }
    const jobId = await createExportJob(apiKey.orgId, apiKey.userId, {
      projectId: projectIdRaw,
      filter,
      includeAgentRunIndex: body?.includeAgentRunIndex === true,
    });
    return NextResponse.json({ jobId, status: "pending" });
  } catch (error) {
    return asRouteError(error);
  }
}

export async function GET(request: Request) {
  if (!isCloudExportsEnabled()) {
    return NextResponse.json(CLOUD_EXPORTS_DISABLED_BODY, { status: 503 });
  }
  const apiKey = await authenticateApiKey(request);
  if (!apiKey || !apiKey.orgId) {
    return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "20");
    const rows = await listExportJobs(apiKey.orgId, {
      limit: Number.isFinite(limit) ? limit : 20,
    });
    return NextResponse.json({
      jobs: rows.map((row) => ({
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
      })),
    });
  } catch (error) {
    return asRouteError(error);
  }
}
