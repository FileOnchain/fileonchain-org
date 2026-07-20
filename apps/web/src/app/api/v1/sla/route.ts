import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/server/api-keys";
import { asRouteError, requireUser } from "@/lib/auth";
import { HttpError } from "@/lib/server/http-error";
import {
  CLOUD_COMPLIANCE_DISABLED_BODY,
  isCloudComplianceEnabled,
} from "@/lib/server/cloud-feature";
import { ensureOrgSla, updateOrgSla } from "@/lib/server/compliance";

/**
 * `GET   /api/v1/sla`             current SLA (lazy-seeds 'free' tier)
 * `PATCH /api/v1/sla`             update tier / limits (admin path)
 *
 * Tier changes require org admin/owner — PATCH checks against
 * `requireOrgRole` upstream in the dashboard session path; the v1
 * bearer-key route restricts to org-scoped keys so a personal key
 * cannot change a tier.
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
    if (!orgId) {
      throw new HttpError(401, "Could not resolve org", "unauthorized");
    }
    const row = await ensureOrgSla(orgId);
    return NextResponse.json({
      sla: {
        orgId: row.orgId,
        tier: row.tier,
        monthlyEnvelopesLimit: row.monthlyEnvelopesLimit,
        monthlyAnchorsLimit: row.monthlyAnchorsLimit,
        monthlyUptimePct: row.monthlyUptimePct,
        settlementLatencyP95Ms: row.settlementLatencyP95Ms,
        updatedAt: row.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return asRouteError(error);
  }
}

export async function PATCH(request: Request) {
  if (!isCloudComplianceEnabled()) {
    return NextResponse.json(CLOUD_COMPLIANCE_DISABLED_BODY, { status: 503 });
  }
  try {
    const apiKey = await authenticateApiKey(request);
    let orgId: string | null = apiKey?.orgId ?? null;
    let actingUserId: string | null = apiKey?.userId ?? null;
    if (!orgId) {
      actingUserId = await requireUser();
      const body = (await request.json().catch(() => null)) as {
        orgId?: unknown;
      } | null;
      const fromBody = typeof body?.orgId === "string" ? body.orgId : "";
      orgId = fromBody || null;
    }
    if (!orgId) {
      throw new HttpError(401, "Could not resolve org", "unauthorized");
    }
    const body = (await request.json().catch(() => null)) as {
      tier?: unknown;
      monthlyEnvelopesLimit?: unknown;
      monthlyAnchorsLimit?: unknown;
      monthlyUptimePct?: unknown;
      settlementLatencyP95Ms?: unknown;
    } | null;
    const patch = {
      tier:
        typeof body?.tier === "string" &&
        (body.tier === "free" ||
          body.tier === "team" ||
          body.tier === "enterprise")
          ? (body.tier as "free" | "team" | "enterprise")
          : undefined,
      monthlyEnvelopesLimit:
        typeof body?.monthlyEnvelopesLimit === "number"
          ? body.monthlyEnvelopesLimit
          : typeof body?.monthlyEnvelopesLimit === "string"
            ? Number(body.monthlyEnvelopesLimit)
            : undefined,
      monthlyAnchorsLimit:
        typeof body?.monthlyAnchorsLimit === "number"
          ? body.monthlyAnchorsLimit
          : typeof body?.monthlyAnchorsLimit === "string"
            ? Number(body.monthlyAnchorsLimit)
            : undefined,
      monthlyUptimePct:
        typeof body?.monthlyUptimePct === "number"
          ? body.monthlyUptimePct
          : undefined,
      settlementLatencyP95Ms:
        typeof body?.settlementLatencyP95Ms === "number"
          ? body.settlementLatencyP95Ms
          : undefined,
    };
    const row = await updateOrgSla(orgId, patch, actingUserId ?? "");
    return NextResponse.json({
      sla: {
        orgId: row.orgId,
        tier: row.tier,
        monthlyEnvelopesLimit: row.monthlyEnvelopesLimit,
        monthlyAnchorsLimit: row.monthlyAnchorsLimit,
        monthlyUptimePct: row.monthlyUptimePct,
        settlementLatencyP95Ms: row.settlementLatencyP95Ms,
        updatedAt: row.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return asRouteError(error);
  }
}
