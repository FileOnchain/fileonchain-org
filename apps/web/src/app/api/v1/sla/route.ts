import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/server/api-keys";
import { asRouteError, requireUser } from "@/lib/auth";
import { HttpError } from "@/lib/server/http-error";
import {
  CLOUD_COMPLIANCE_DISABLED_BODY,
  isCloudComplianceEnabled,
} from "@/lib/server/cloud-feature";
import { requireOrgRole } from "@/lib/server/organizations";
import { ensureOrgSla, updateOrgSla } from "@/lib/server/compliance";

/**
 * `GET   /api/v1/sla`             current SLA (lazy-seeds 'free' tier)
 * `PATCH /api/v1/sla`             update tier / limits (admin path)
 *
 * Auth modes:
 *  - API key — `orgId` is read off the key's scope; the doc comment
 *              that says "the role check is upstream" was incorrect
 *              (the v1 surface accepts the orgId from a query/body
 *              when no key is present, so the membership check has
 *              to live here for the session path).
 *  - Session — `orgId` is read from `?orgId=` / body, and the
 *              requester must be a member of that org. PATCH further
 *              requires owner/admin; GET any member.
 */

export async function GET(request: Request) {
  if (!isCloudComplianceEnabled()) {
    return NextResponse.json(CLOUD_COMPLIANCE_DISABLED_BODY, { status: 503 });
  }
  try {
    const apiKey = await authenticateApiKey(request);
    let orgId: string | null = apiKey?.orgId ?? null;
    if (!orgId) {
      const userId = await requireUser();
      const url = new URL(request.url);
      const queryOrgId = url.searchParams.get("orgId");
      if (!queryOrgId) {
        return NextResponse.json({ error: "Missing orgId" }, { status: 400 });
      }
      // Verify the session user is actually a member of the org they
      // claim — without this, any signed-in user could read any org's
      // SLA by passing its id. The role list is permissive (any
      // member) because GET is non-mutating.
      await requireOrgRole(userId, queryOrgId, ["owner", "admin", "member"]);
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
      const userId = await requireUser();
      const body = (await request.json().catch(() => null)) as {
        orgId?: unknown;
      } | null;
      const fromBody = typeof body?.orgId === "string" ? body.orgId : "";
      if (!fromBody) {
        throw new HttpError(400, "Missing orgId", "bad_request");
      }
      // Verify the session user is an owner/admin of the org they
      // claim — tier changes are sensitive (they shift SLA caps and
      // billing posture) and require admin authority.
      await requireOrgRole(userId, fromBody, ["owner", "admin"]);
      actingUserId = userId;
      orgId = fromBody;
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
