import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { requireOrgRole } from "@/lib/server/organizations";
import {
  generateOrgSigner,
  getActiveOrgSigner,
  revokeOrgSigner,
} from "@/lib/server/cloud-signer";
import { logActivity } from "@/lib/server/activity";
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
 */

export async function GET(_request: Request, { params }: Params) {
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
  try {
    const userId = await requireUser();
    const { id } = await params;
    await requireOrgRole(userId, id);
    const signer = await generateOrgSigner(id);
    await logActivity(userId, "cloud_signer_generated", {
      orgId: id,
      publicKey: signer.publicKey,
    });
    return NextResponse.json({ signer });
  } catch (error) {
    return asOrgError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const userId = await requireUser();
    const { id } = await params;
    await requireOrgRole(userId, id);
    const revoked = await revokeOrgSigner(id);
    if (revoked) {
      await logActivity(userId, "cloud_signer_revoked", { orgId: id });
    }
    return NextResponse.json({ ok: true, revoked });
  } catch (error) {
    return asOrgError(error);
  }
}
