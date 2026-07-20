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
 * Per-(org | project) Cloud signing key — the `server_sign` /
 * `server_sign_project` capability. The Cloud generates an ed25519
 * keypair per scope, seals the seed at rest (AES-256-GCM via
 * `secretbox.ts`), and uses it to add an ENVELOPE signature to
 * submitted envelopes. That signature is a `service` signer identity
 * attesting the Cloud assembled/exported the envelope — it is never an
 * artifact signature, so it does not claim authorship of the subject
 * (see CLAUDE.md language policy). The public key is served
 * unauthenticated at `/api/cloud/signer/[orgId]` or
 * `/api/cloud/signer/project/[projectId]` (the `keyStatusUrl`), so
 * verifiers can check rotation/revocation independently.
 *
 * Org scope is identified by `projectId IS NULL` on the `cloud_signer`
 * row; project scope is identified by `projectId = <projectId>`. The
 * DB enforces at most one active (revoked_at IS NULL) row per scope
 * (partial unique indexes on `(org_id)` and `(project_id)`).
 */

const textEncoder = new TextEncoder();

export type CloudSignerScope =
  | { kind: "org"; orgId: string }
  | { kind: "project"; orgId: string; projectId: string };

export interface CloudSignerStatus {
  publicKey: string;
  scheme: "ed25519";
  keyPreview: string;
  scope: CloudSignerScope;
  createdAt: string;
  revokedAt: string | null;
}

/** URL a verifier resolves to check this scope's signer key status. */
export const cloudSignerStatusUrl = (scope: CloudSignerScope): string => {
  if (scope.kind === "org") {
    return `${siteConfig.url}/api/cloud/signer/${scope.orgId}`;
  }
  return `${siteConfig.url}/api/cloud/signer/project/${scope.projectId}`;
};

/** Internal: fetch the active (non-revoked) signer row for a scope. */
const activeSignerRow = async (scope: CloudSignerScope) => {
  const conditions =
    scope.kind === "org"
      ? and(
          eq(cloudSigners.orgId, scope.orgId),
          isNull(cloudSigners.projectId),
          isNull(cloudSigners.revokedAt),
        )
      : and(
          eq(cloudSigners.projectId, scope.projectId),
          eq(cloudSigners.orgId, scope.orgId),
          isNull(cloudSigners.revokedAt),
        );
  const [row] = await db
    .select()
    .from(cloudSigners)
    .where(conditions)
    .limit(1);
  return row ?? null;
};

const rowToStatus = (row: typeof cloudSigners.$inferSelect): CloudSignerStatus => {
  const scope: CloudSignerScope =
    row.projectId && row.orgId
      ? { kind: "project", orgId: row.orgId, projectId: row.projectId }
      : { kind: "org", orgId: row.orgId };
  return {
    publicKey: row.publicKey,
    scheme: row.scheme,
    keyPreview: row.keyPreview,
    scope,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  };
};

/** Active signer for an org. Returns null when none is active. */
export const getActiveOrgSigner = async (
  orgId: string,
): Promise<CloudSignerStatus | null> => {
  const row = await activeSignerRow({ kind: "org", orgId });
  return row ? rowToStatus(row) : null;
};

/** Active signer for a project. Returns null when none is active. */
export const getActiveProjectSigner = async (
  projectId: string,
): Promise<CloudSignerStatus | null> => {
  // The schema's project_id column is nullable, so we resolve the org
  // id by joining on the projects table — done inline to avoid pulling
  // the projects service in here (it would also pull in the activities
  // log path, which is wrong for a verifier endpoint hot-loop).
  const row = await db
    .select()
    .from(cloudSigners)
    .where(
      and(
        eq(cloudSigners.projectId, projectId),
        isNull(cloudSigners.revokedAt),
      ),
    )
    .limit(1);
  const found = row[0];
  if (!found) return null;
  return rowToStatus(found);
};

/**
 * Public status of the most recent signer for a verifier endpoint. If
 * there is an active row, return that; otherwise fall back to the most
 * recently revoked row so a stale `keyStatusUrl` still resolves to
 * "revoked" rather than 404.
 */
export const getOrgSignerStatus = async (
  orgId: string,
): Promise<CloudSignerStatus | null> => {
  const active = await getActiveOrgSigner(orgId);
  if (active) return active;
  const [row] = await db
    .select()
    .from(cloudSigners)
    .where(
      and(eq(cloudSigners.orgId, orgId), isNull(cloudSigners.projectId)),
    )
    .orderBy(desc(cloudSigners.createdAt))
    .limit(1);
  if (!row) return null;
  return rowToStatus(row);
};

/** Same as `getOrgSignerStatus` but for project scope. */
export const getProjectSignerStatus = async (
  projectId: string,
): Promise<CloudSignerStatus | null> => {
  const active = await getActiveProjectSigner(projectId);
  if (active) return active;
  const [row] = await db
    .select()
    .from(cloudSigners)
    .where(eq(cloudSigners.projectId, projectId))
    .orderBy(desc(cloudSigners.createdAt))
    .limit(1);
  if (!row) return null;
  return rowToStatus(row);
};

/**
 * Generate a fresh ed25519 signer for the scope, revoking any existing
 * active one first (rotation). Returns the new public status. The
 * 32-byte seed is sealed before it touches the DB and never leaves the
 * server.
 */
export const generateCloudSigner = async (
  scope: CloudSignerScope,
): Promise<CloudSignerStatus> => {
  if (scope.kind === "project") {
    // Project signer is only valid for envelopes explicitly bound to
    // that project — the route layer still needs the org scope, but
    // the row is owned by the project id.
    const projectId = scope.projectId;
    const orgId = scope.orgId;
    const seed = randomBytes(32);
    const publicKey = bytesToHex(ed25519.getPublicKey(seed));
    const encryptedSecret = sealSecret(bytesToHex(seed));
    const keyPreview = publicKey.slice(0, 8);

    await db.transaction(async (tx) => {
      await tx
        .update(cloudSigners)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(cloudSigners.projectId, projectId),
            isNull(cloudSigners.revokedAt),
          ),
        );
      await tx.insert(cloudSigners).values({
        orgId,
        projectId,
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
      scope,
      createdAt: new Date().toISOString(),
      revokedAt: null,
    };
  }

  const orgId = scope.orgId;
  const seed = randomBytes(32);
  const publicKey = bytesToHex(ed25519.getPublicKey(seed));
  const encryptedSecret = sealSecret(bytesToHex(seed));
  const keyPreview = publicKey.slice(0, 8);

  await db.transaction(async (tx) => {
    await tx
      .update(cloudSigners)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(cloudSigners.orgId, orgId),
          isNull(cloudSigners.projectId),
          isNull(cloudSigners.revokedAt),
        ),
      );
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
    scope,
    createdAt: new Date().toISOString(),
    revokedAt: null,
  };
};

/** Back-compat shim for the original org-only public surface. */
export const generateOrgSigner = async (
  orgId: string,
): Promise<CloudSignerStatus> => generateCloudSigner({ kind: "org", orgId });

/** Revoke the active signer for a scope. No-op when none is active. */
export const revokeCloudSigner = async (
  scope: CloudSignerScope,
): Promise<boolean> => {
  const conditions =
    scope.kind === "org"
      ? and(
          eq(cloudSigners.orgId, scope.orgId),
          isNull(cloudSigners.projectId),
          isNull(cloudSigners.revokedAt),
        )
      : and(
          eq(cloudSigners.projectId, scope.projectId),
          isNull(cloudSigners.revokedAt),
        );
  const result = await db
    .update(cloudSigners)
    .set({ revokedAt: new Date() })
    .where(conditions)
    .returning({ id: cloudSigners.id });
  return result.length > 0;
};

/** Back-compat shim for org-scoped revocation. */
export const revokeOrgSigner = async (orgId: string): Promise<boolean> =>
  revokeCloudSigner({ kind: "org", orgId });

/**
 * Add a Cloud envelope signature to `envelope` using the active signer
 * for the scope. Throws 409 when the scope has not generated one —
 * server-side sealing requires an explicit key so the failure is
 * honest, never a silent unsigned passthrough. Delegates to
 * `signEnvelope` from `@fileonchain/sdk/evidence`, which appends an
 * envelope signature without touching the envelope digest.
 */
export const signEnvelopeForScope = async (
  scope: CloudSignerScope,
  envelope: EvidenceEnvelope,
): Promise<EvidenceEnvelope> => {
  const row = await activeSignerRow(scope);
  if (!row) {
    const where = scope.kind === "org" ? "organization" : "project";
    throw new HttpError(
      409,
      `server_sign requires an active Cloud signer for this ${where} — generate one on /cloud/signer first`,
      "conflict",
    );
  }
  const seed = hexToBytes(openSecret(row.encryptedSecret));
  const signerId =
    scope.kind === "org"
      ? `fileonchain-cloud:org:${scope.orgId}`
      : `fileonchain-cloud:project:${scope.projectId}`;

  const signer: EvidenceSigner = {
    signer: {
      kind: "service",
      id: signerId,
      publicKey: row.publicKey,
      scheme: "ed25519",
      keyStatusUrl: cloudSignerStatusUrl(scope),
    },
    signedAt: new Date().toISOString(),
    sign: (payload: string) =>
      bytesToHex(ed25519.sign(textEncoder.encode(payload), seed)),
  };

  return signEnvelope(envelope, [signer]);
};

/** Back-compat shim for org-scoped signing. */
export const signEnvelopeForOrg = (
  orgId: string,
  envelope: EvidenceEnvelope,
): Promise<EvidenceEnvelope> =>
  signEnvelopeForScope({ kind: "org", orgId }, envelope);
