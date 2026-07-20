import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/server/api-keys";
import { asRouteError, requireUser } from "@/lib/auth";
import { HttpError } from "@/lib/server/http-error";
import {
  CLOUD_COMPLIANCE_DISABLED_BODY,
  isCloudComplianceEnabled,
} from "@/lib/server/cloud-feature";
import {
  generateComplianceReport,
  listComplianceReports,
} from "@/lib/server/compliance";

/**
 * `GET  /api/v1/compliance-reports?limit=`  recent reports
 * `POST /api/v1/compliance-reports`         on-demand generation
 *
 * Auth: org-scoped API key OR session (for the dashboard UI).
 */

export async function GET(request: Request) {
  if (!isCloudComplianceEnabled()) {
    return NextResponse.json(CLOUD_COMPLIANCE_DISABLED_BODY, { status: 503 });
  }
  try {
    const apiKey = await authenticateApiKey(request);
    let orgId: string | null = apiKey?.orgId ?? null;
    if (!orgId) {
      await requireUser();
      const url = new URL(request.url);
      const queryOrgId = url.searchParams.get("orgId");
      if (!queryOrgId) {
        return NextResponse.json({ error: "Missing orgId" }, { status: 400 });
      }
      orgId = queryOrgId;
    }
    if (!orgId)
      return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "20");
    const rows = await listComplianceReports(orgId, {
      limit: Number.isFinite(limit) ? limit : 20,
    });
    return NextResponse.json({
      reports: rows.map((row) => ({
        id: row.id,
        periodStart: row.periodStart.toISOString(),
        periodEnd: row.periodEnd.toISOString(),
        generatedAt: row.generatedAt.toISOString(),
        envelopeDigest: row.envelopeDigest,
      })),
    });
  } catch (error) {
    return asRouteError(error);
  }
}

export async function POST(request: Request) {
  if (!isCloudComplianceEnabled()) {
    return NextResponse.json(CLOUD_COMPLIANCE_DISABLED_BODY, { status: 503 });
  }
  try {
    const userId = await requireUser();
    const body = (await request.json().catch(() => null)) as {
      orgId?: unknown;
      periodStart?: unknown;
      periodEnd?: unknown;
    } | null;
    const orgId = typeof body?.orgId === "string" ? body.orgId : "";
    if (!orgId) {
      throw new HttpError(400, "Missing orgId", "bad_request");
    }
    const periodStart =
      typeof body?.periodStart === "string"
        ? new Date(body.periodStart)
        : null;
    const periodEnd =
      typeof body?.periodEnd === "string"
        ? new Date(body.periodEnd)
        : null;
    if (
      !periodStart ||
      !periodEnd ||
      isNaN(periodStart.getTime()) ||
      isNaN(periodEnd.getTime())
    ) {
      throw new HttpError(
        400,
        "periodStart + periodEnd must be ISO date strings",
        "bad_request",
      );
    }
    if (periodStart >= periodEnd) {
      throw new HttpError(
        400,
        "periodStart must be strictly before periodEnd",
        "bad_request",
      );
    }
    const row = await generateComplianceReport(orgId, periodStart, periodEnd, userId);
    return NextResponse.json({
      report: {
        id: row.id,
        periodStart: row.periodStart.toISOString(),
        periodEnd: row.periodEnd.toISOString(),
        generatedAt: row.generatedAt.toISOString(),
        envelopeDigest: row.envelopeDigest,
      },
    });
  } catch (error) {
    return asRouteError(error);
  }
}
