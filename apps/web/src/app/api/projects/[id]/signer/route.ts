import { NextResponse } from "next/server";
import { requireUser, asRouteError } from "@/lib/auth";
import {
  CLOUD_TENANCY_DISABLED_BODY,
  isCloudTenancyEnabled,
} from "@/lib/server/cloud-feature";
import {
  generateCloudSigner,
  revokeCloudSigner,
  cloudSignerStatusUrl,
} from "@/lib/server/cloud-signer";
import { requireProjectRole, getProjectOrgId } from "@/lib/server/projects";
import { logActivity } from "@/lib/server/activity";
import { HttpError } from "@/lib/server/http-error";
import { enqueueWebhookDeliveries } from "@/lib/server/webhooks";

type Action = "generate" | "rotate" | "revoke";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isCloudTenancyEnabled()) {
    return NextResponse.json(CLOUD_TENANCY_DISABLED_BODY, { status: 503 });
  }
  try {
    const userId = await requireUser();
    const { id: projectId } = await params;
    await requireProjectRole(userId, projectId, ["lead"]);
    const orgId = await getProjectOrgId(projectId);
    if (!orgId) throw new HttpError(404, "Project not found", "not_found");
    const body = (await request.json().catch(() => null)) as {
      action?: unknown;
    } | null;
    const action = body?.action as Action;
    const scope = { kind: "project", orgId, projectId } as const;
    const url = cloudSignerStatusUrl(scope);
    let status: { publicKey: string; revokedAt: string | null; keyPreview: string; createdAt: string } | null = null;
    let rotatedEvent: "signer.rotated" | "signer.revoked" | null = null;
    if (action === "generate" || action === "rotate") {
      const generated = await generateCloudSigner(scope);
      status = {
        publicKey: generated.publicKey,
        keyPreview: generated.keyPreview,
        createdAt: generated.createdAt,
        revokedAt: generated.revokedAt,
      };
      rotatedEvent = "signer.rotated";
    } else if (action === "revoke") {
      const didRevoke = await revokeCloudSigner(scope);
      if (!didRevoke) {
        throw new HttpError(409, "No active signer to revoke", "conflict");
      }
      rotatedEvent = "signer.revoked";
    } else {
      throw new HttpError(400, "Expected action: generate|rotate|revoke", "bad_request");
    }
    if (rotatedEvent) {
      await logActivity(userId, rotatedEvent === "signer.rotated" ? "cloud_signer_generated" : "cloud_signer_revoked", {
        scope: "project",
        projectId,
        orgId,
      });
      void enqueueWebhookDeliveries(orgId, rotatedEvent, projectId, {
        scope: "project",
        projectId,
        orgId,
        keyStatusUrl: url,
      });
    }
    return NextResponse.json({ ok: true, status, keyStatusUrl: url });
  } catch (error) {
    return asRouteError(error);
  }
}
