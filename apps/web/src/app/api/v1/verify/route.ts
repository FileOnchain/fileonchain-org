import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/server/api-keys";
import {
  runServerVerify,
  type ServerVerifyBody,
} from "@/lib/server/verify-server";
import { HttpError } from "@/lib/server/http-error";
import { asRouteError } from "@/lib/auth";
import {
  CLOUD_DISABLED_BODY,
  isCloudEvidenceEnabled,
} from "@/lib/server/cloud-feature";
import { type OrgApiKey } from "@/lib/server/evidence";

/**
 * `POST /api/v1/verify` — run the open verifier server-side. Accepts:
 *  - `{ envelopeId, subjectBytes? b64, checkReceiptsOnline? }` (case A)
 *  - `{ envelope, subjectBytes? b64, checkReceiptsOnline? }` (case B)
 *
 * The response is the same `VerificationReport` shape as the
 * `@fileonchain/verify` package — chip wording and grouped checks
 * untouched, so a user cannot tell which surface is "ground truth".
 */

const asOrgApiKey = (row: NonNullable<Awaited<ReturnType<typeof authenticateApiKey>>>): OrgApiKey => ({
  id: row.id,
  userId: row.userId,
  orgId: row.orgId,
  scope: row.scope,
});

const decodeSubjectBytes = (raw: unknown): Uint8Array | undefined => {
  if (typeof raw !== "string" || !raw) return undefined;
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(raw, "base64"));
  // Edge / browser fallback — atob is available everywhere `fetch` is.
  const binary = atob(raw);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
};

export async function POST(request: Request) {
  if (!isCloudEvidenceEnabled()) {
    return NextResponse.json(CLOUD_DISABLED_BODY, { status: 503 });
  }
  const apiKey = await authenticateApiKey(request);
  if (!apiKey) {
    return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }
  try {
    const json = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!json) throw new HttpError(400, "Body must be JSON", "bad_request");

    const subjectBytes = decodeSubjectBytes(json.subjectBytesB64);
    const checkReceiptsOnline =
      typeof json.checkReceiptsOnline === "boolean" ? json.checkReceiptsOnline : undefined;

    let body: ServerVerifyBody;
    if (typeof json.envelopeId === "string") {
      body = {
        envelopeId: json.envelopeId,
        ...(subjectBytes ? { subjectBytes } : {}),
        ...(checkReceiptsOnline !== undefined ? { checkReceiptsOnline } : {}),
      };
    } else if (json.envelope && typeof json.envelope === "object") {
      body = {
        envelope: json.envelope as ServerVerifyBody extends { envelope: infer E } ? E : never,
        ...(subjectBytes ? { subjectBytes } : {}),
        ...(checkReceiptsOnline !== undefined ? { checkReceiptsOnline } : {}),
      };
    } else {
      throw new HttpError(
        400,
        "Body must be { envelopeId } or { envelope }",
        "bad_request",
      );
    }

    const report = await runServerVerify(asOrgApiKey(apiKey), body);
    return NextResponse.json(report);
  } catch (error) {
    return asRouteError(error);
  }
}
