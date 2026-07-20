import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { ed25519 } from "@noble/curves/ed25519.js";
import { randomBytes } from "node:crypto";
import { bytesToHex, hexToBytes, type EvidenceEnvelope } from "@fileonchain/protocol";
import { signEnvelope, type EvidenceSigner } from "@fileonchain/sdk/evidence";
import { db, cloudSigners } from "@/lib/db";
import { sealSecret, openSecret } from "@/lib/crypto/secretbox";
import { HttpError } from "@/lib/server/http-error";
import { siteConfig } from "@/lib/site";

/**
 * Per-org Cloud signing key — the `server_sign` capability. The Cloud
 * generates an ed25519 keypair per org, seals the seed at rest (AES-256-GCM
 * via `secretbox.ts`), and uses it to add an ENVELOPE signature to submitted
 * envelopes. That signature is a `service` signer identity attesting the
 * Cloud assembled/exported the envelope — it is never an artifact signature,
 * so it does not claim authorship of the subject (see CLAUDE.md language
 * policy). The public key is served unauthenticated at
 * `/api/cloud/signer/[orgId]` (the `keyStatusUrl`), so verifiers can check
 * rotation/revocation independently.
 */

const textEncoder = new TextEncoder();

export interface CloudSignerStatus {
  publicKey: string;
  scheme: "ed25519";
  keyPreview: string;
  createdAt: string;
  revokedAt: string | null;
}

/** URL a verifier resolves to check this org's signer key status. */
export const cloudSignerStatusUrl = (orgId: string): string =>
  `${siteConfig.url}/api/cloud/signer/${orgId}`;

/** The active (non-revoked) signer row for an org, or null. */
const activeSignerRow = async (orgId: string) => {
  const [row] = await db
    .select()
    .from(cloudSigners)
    .where(and(eq(cloudSigners.orgId, orgId), isNull(cloudSigners.revokedAt)))
    .limit(1);
  return row ?? null;
};

/** Public status of the org's active signer (no secret material). */
export const getActiveOrgSigner = async (
  orgId: string,
): Promise<CloudSignerStatus | null> => {
  const row = await activeSignerRow(orgId);
  if (!row) return null;
  return {
    publicKey: row.publicKey,
    scheme: row.scheme,
    keyPreview: row.keyPreview,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  };
};

/** Public status for the verifier endpoint — active row if present,
 *  otherwise the most recent revoked row so a stale `keyStatusUrl` still
 *  resolves to "revoked" rather than 404. Returns null when the org never
 *  had a signer. */
export const getOrgSignerStatus = async (
  orgId: string,
): Promise<CloudSignerStatus | null> => {
  const active = await getActiveOrgSigner(orgId);
  if (active) return active;
  const [row] = await db
    .select()
    .from(cloudSigners)
    .where(eq(cloudSigners.orgId, orgId))
    .orderBy(desc(cloudSigners.createdAt))
    .limit(1);
  if (!row) return null;
  return {
    publicKey: row.publicKey,
    scheme: row.scheme,
    keyPreview: row.keyPreview,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  };
};

/**
 * Generate a fresh ed25519 signer for an org, revoking any existing active
 * one first (rotation). Returns the new public status. The 32-byte seed is
 * sealed before it touches the DB and never leaves the server.
 */
export const generateOrgSigner = async (
  orgId: string,
): Promise<CloudSignerStatus> => {
  const seed = randomBytes(32);
  const publicKey = bytesToHex(ed25519.getPublicKey(seed));
  const encryptedSecret = sealSecret(bytesToHex(seed));
  const keyPreview = publicKey.slice(0, 8);

  await db.transaction(async (tx) => {
    await tx
      .update(cloudSigners)
      .set({ revokedAt: new Date() })
      .where(and(eq(cloudSigners.orgId, orgId), isNull(cloudSigners.revokedAt)));
    await tx.insert(cloudSigners).values({
      orgId,
      scheme: "ed25519",
      publicKey,
      encryptedSecret,
      keyPreview,
    });
  });

  return {
    publicKey,
    scheme: "ed25519",
    keyPreview,
    createdAt: new Date().toISOString(),
    revokedAt: null,
  };
};

/** Revoke the org's active signer. No-op when none is active. */
export const revokeOrgSigner = async (orgId: string): Promise<boolean> => {
  const result = await db
    .update(cloudSigners)
    .set({ revokedAt: new Date() })
    .where(and(eq(cloudSigners.orgId, orgId), isNull(cloudSigners.revokedAt)))
    .returning({ id: cloudSigners.id });
  return result.length > 0;
};

/**
 * Add a Cloud envelope signature to `envelope` using the org's active
 * signer. Throws 409 when the org has not generated one — server-side
 * sealing requires an explicit key so the failure is honest, never a silent
 * unsigned passthrough. Delegates to `signEnvelope` from
 * `@fileonchain/sdk/evidence`, which appends an envelope signature without
 * touching the envelope digest.
 */
export const signEnvelopeForOrg = async (
  orgId: string,
  envelope: EvidenceEnvelope,
): Promise<EvidenceEnvelope> => {
  const row = await activeSignerRow(orgId);
  if (!row) {
    throw new HttpError(
      409,
      "server_sign requires an active Cloud signer for this org — generate one on /cloud/signer first",
      "conflict",
    );
  }
  const seed = hexToBytes(openSecret(row.encryptedSecret));

  const signer: EvidenceSigner = {
    signer: {
      kind: "service",
      id: `fileonchain-cloud:org:${orgId}`,
      publicKey: row.publicKey,
      scheme: "ed25519",
      keyStatusUrl: cloudSignerStatusUrl(orgId),
    },
    signedAt: new Date().toISOString(),
    sign: (payload: string) =>
      bytesToHex(ed25519.sign(textEncoder.encode(payload), seed)),
  };

  return signEnvelope(envelope, [signer]);
};
