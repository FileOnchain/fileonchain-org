import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { requireOrgRole } from "@/lib/server/organizations";
import {
  generateOrgSigner,
  getActiveOrgSigner,
  revokeOrgSigner,
} from "@/lib/server/cloud-signer";
import { logActivity } from "@/lib/server/activity";
import { enqueueWebhookDeliveries } from "@/lib/server/webhooks";
import {
  CLOUD_DISABLED_BODY,
  isCloudEvidenceEnabled,
} from "@/lib/server/cloud-feature";
import { asOrgError } from "../../shared";

type Params = { params: Promise<{ id: string }> };

/**
 * Session-authed management of an org's Cloud signer (the `server_sign`
 * key). Distinct from the public `/api/cloud/signer/[orgId]` status
 * endpoint. Only owners/admins may generate, rotate, or revoke.
 *
 *  - GET    — the active signer's public status (null when none).
 *  - POST   — generate a fresh key, rotating (revoking) any active one.
 *  - DELETE — revoke the active key; `server_sign` then returns 409 until
 *             a new one is generated.
 *
 * Gated on `FILEONCHAIN_CLOUD_EVIDENCE_ENABLED` — the public key status
 * (`/api/cloud/signer/[orgId]`) stays open so verifiers can always
 * resolve `keyStatusUrl`, but the management surface is part of the
 * closed Cloud evidence feature.
 *
 * POST emits `signer.rotated` and DELETE emits `signer.revoked` webhook
 * events when the operation actually changes state. The project-signer
 * pipeline (sibling route under `/api/projects/[id]/signer`) emits the
 * same pair; the org-level path was missing them, so verifiers
 * subscribed to the documented event types saw nothing happen on org
 * signer rotation.
 */

export async function GET(_request: Request, { params }: Params) {
  if (!isCloudEvidenceEnabled()) {
    return NextResponse.json(CLOUD_DISABLED_BODY, { status: 503 });
  }
  try {
    const userId = await requireUser();
    const { id } = await params;
    await requireOrgRole(userId, id);
    const signer = await getActiveOrgSigner(id);
    return NextResponse.json({ signer });
  } catch (error) {
    return asOrgError(error);
  }
}

export async function POST(_request: Request, { params }: Params) {
  if (!isCloudEvidenceEnabled()) {
    return NextResponse.json(CLOUD_DISABLED_BODY, { status: 503 });
  }
  try {
    const userId = await requireUser();
    const { id } = await params;
    await requireOrgRole(userId, id);
    const signer = await generateOrgSigner(id);
    await logActivity(userId, "cloud_signer_generated", {
      orgId: id,
      publicKey: signer.publicKey,
    });
    void enqueueWebhookDeliveries(id, "signer.rotated", `org-${id}-${signer.publicKey.slice(0, 8)}`, {
      scope: "org",
      orgId: id,
      publicKey: signer.publicKey,
      keyPreview: signer.keyPreview,
    });
    return NextResponse.json({ signer });
  } catch (error) {
    return asOrgError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  if (!isCloudEvidenceEnabled()) {
    return NextResponse.json(CLOUD_DISABLED_BODY, { status: 503 });
  }
  try {
    const userId = await requireUser();
    const { id } = await params;
    await requireOrgRole(userId, id);
    const revoked = await revokeOrgSigner(id);
    if (revoked) {
      await logActivity(userId, "cloud_signer_revoked", { orgId: id });
      void enqueueWebhookDeliveries(id, "signer.revoked", `org-${id}-revoked-${Date.now()}`, {
        scope: "org",
        orgId: id,
      });
    }
    return NextResponse.json({ ok: true, revoked });
  } catch (error) {
    return asOrgError(error);
  }
}
