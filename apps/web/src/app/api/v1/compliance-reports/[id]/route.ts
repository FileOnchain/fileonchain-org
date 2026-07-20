import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/server/api-keys";
import { asRouteError, requireUser } from "@/lib/auth";
import { HttpError } from "@/lib/server/http-error";
import {
  CLOUD_COMPLIANCE_DISABLED_BODY,
  isCloudComplianceEnabled,
} from "@/lib/server/cloud-feature";
import { getComplianceReport } from "@/lib/server/compliance";
import { logActivity } from "@/lib/server/activity";

/**
 * `GET /api/v1/compliance-reports/[id]` — return the canonical
 * envelope JSON of a single report. Two modes:
 *
 *   - API key (org/project scope) — returns the report immediately
 *   - Session                    — looks up a membership-derived org
 *                                  and returns the report (used by
 *                                  /cloud/compliance)
 */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isCloudComplianceEnabled()) {
    return NextResponse.json(CLOUD_COMPLIANCE_DISABLED_BODY, { status: 503 });
  }
  try {
    const { id } = await params;
    const apiKey = await authenticateApiKey(request);
    let orgId: string | null = apiKey?.orgId ?? null;
    let actingUserId: string | null = apiKey?.userId ?? null;
    if (!orgId) {
      const userId = await requireUser();
      actingUserId = userId;
      const url = new URL(request.url);
      const queryOrgId = url.searchParams.get("orgId");
      if (!queryOrgId) {
        return NextResponse.json({ error: "Missing orgId" }, { status: 400 });
      }
      orgId = queryOrgId;
    }
    if (!orgId) {
      throw new HttpError(401, "Could not resolve org", "unauthorized");
    }
    const row = await getComplianceReport(orgId, id);
    if (!row) {
      throw new HttpError(404, "Report not found", "not_found");
    }
    if (actingUserId) {
      await logActivity(actingUserId, "compliance_report_downloaded", {
        reportId: row.id,
      });
    }
    return NextResponse.json({
      report: {
        id: row.id,
        periodStart: row.periodStart.toISOString(),
        periodEnd: row.periodEnd.toISOString(),
        generatedAt: row.generatedAt.toISOString(),
        envelope: row.envelope,
        envelopeDigest: row.envelopeDigest,
      },
    });
  } catch (error) {
    return asRouteError(error);
  }
}
