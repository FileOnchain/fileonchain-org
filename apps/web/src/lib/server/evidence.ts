import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  parseEnvelope,
  validateEnvelope,
  computeEnvelopeDigest,
  type EvidenceEnvelope,
} from "@fileonchain/protocol";
import { HttpError } from "@/lib/server/http-error";
import { orgScopedKeyRequired } from "@/lib/server/http-error";
import { logActivity } from "@/lib/server/activity";
import { signEnvelopeForOrg } from "@/lib/server/cloud-signer";
import { applyRetentionToNewEnvelope } from "@/lib/server/retention";
import {
  db,
  evidenceEnvelopes,
  organizationMembers,
  type EvidenceClaimSummary,
} from "@/lib/db";

/**
 * Evidence service — central store for sealed `EvidenceEnvelope` rows owned
 * by an org. Every other Cloud evidence surface (routes, hosted page,
 * retention sweep, verify-server) reads/writes through here so the
 * tenancy and validation rules live in one place.
 *
 * Design rules:
 *  - Every envelope MUST belong to an org (NOT NULL column). API keys with
 *    `orgId IS NULL` are rejected at the entry point with 403
 *    `org_scoped_key_required` — see `requireOrgApiKey` below.
 *  - The Cloud-only fields (orgId, expiresAt, verificationCount,
 *    apiKeyId, userId, claimSummary) live in DB columns only. They are
 *    NEVER inserted into the envelope JSON itself — that would couple
 *    Cloud metadata to the open-format envelope (CLAUDE.md:411-413).
 *  - `envelopeDigest` is recomputed server-side from the submitted JSON
 *    so the row carries the protocol's digest of record; the caller does
 *    not get to choose what we store.
 */

/* ------------------------------------------------------------------ */
/* Tenancy guards                                                      */
/* ------------------------------------------------------------------ */

/** Shape of `authenticateApiKey`'s row — typed here so callers don't have
 *  to import the Drizzle schema directly. `scope` is the union over the
 *  three Cloud evidence surfaces: org-scoped keys seal any envelope under
 *  the org; project-scoped keys seal only into the named project. */
export interface OrgApiKey {
  id: string;
  userId: string;
  orgId: string | null;
  projectId: string | null;
  scope: "personal" | "org" | "project";
}

/**
 * Resolve the authed key to an org id. Throws `org_scoped_key_required`
 * (403) when the caller presented a personal key. Both `org` and
 * `project` scopes are accepted; project-scoped callers bind their
 * project when they call `submitEvidence(..., { projectId })`.
 */
export const requireOrgApiKey = (apiKey: OrgApiKey): string => {
  if (!apiKey.orgId || apiKey.scope === "personal")
    throw orgScopedKeyRequired();
  return apiKey.orgId;
};

/** Resolve the caller's tenant — either the org (no project) or the
 *  org+project pair. Throws `org_scoped_key_required` when the key is
 *  personal. Use this when the route accepts an optional `project` body
 *  parameter and the caller wants to assert a specific project. */
export const requireTenantApiKey = (
  apiKey: OrgApiKey,
): { orgId: string; projectId: string | null } => {
  const orgId = requireOrgApiKey(apiKey);
  return { orgId, projectId: apiKey.projectId };
};

/** Org ids a user belongs to, for `/cloud/*` pages that span orgs. */
export const listUserOrgIds = async (userId: string): Promise<string[]> => {
  const rows = await db
    .select({ orgId: organizationMembers.orgId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, userId));
  return rows.map((r) => r.orgId);
};

/* ------------------------------------------------------------------ */
/* Submit + read                                                       */
/* ------------------------------------------------------------------ */

/** Inputs for `submitEvidence`. The route handler validates the shape and
 *  hands us the already-parsed envelope. */
export interface SubmitEvidenceInput {
  /** The canonical envelope JSON, exactly as the caller wants it stored. */
  envelope: EvidenceEnvelope;
  /**
   * When true, the Cloud adds an *envelope* signature with the org's active
   * `service` signer before storing (the `server_sign` capability). Requires
   * the org to have generated a Cloud signer first; throws 409 otherwise.
   */
  serverSign?: boolean;
}

/**
 * Validate and store an envelope. Recomputes the envelope digest server-
 * side so the row carries the protocol's canonical value, and derives the
 * claim summary so the GIN-indexed search column has data to index. When
 * `serverSign` is set, the org's Cloud signer adds an envelope signature
 * first — the digest is unaffected (envelope signatures live outside the
 * digested region), so the stored digest is the protocol's value either way.
 *
 * TODO(kcd): credits debit. Ingestion is currently free; the cost is the
 * block of bytes the caller already paid to seal, not Cloud storage.
 */
export const submitEvidence = async (
  apiKey: OrgApiKey,
  { envelope, serverSign = false }: SubmitEvidenceInput,
) => {
  const orgId = requireOrgApiKey(apiKey);

  // Belt-and-braces: re-validate via the protocol package. The caller
  // already passed `parseEnvelope` upstream; this catches anything that
  // looked like an envelope structurally but fails the protocol's checks.
  const errors = validateEnvelope(envelope);
  if (errors.length > 0) {
    throw new HttpError(
      400,
      `Envelope validation failed: ${errors.join("; ")}`,
      "bad_request",
    );
  }

  // Server-side sealing: add the org's `service` envelope signature before
  // we compute the digest + claim summary so the Cloud signer is captured in
  // both. Throws 409 when the org has no active Cloud signer.
  const sealed = serverSign
    ? await signEnvelopeForOrg(orgId, envelope)
    : envelope;

  const id = crypto.randomUUID();
  const envelopeDigest = computeEnvelopeDigest(sealed);
  const subjectSha256 =
    typeof sealed.subject.digests?.sha256 === "string"
      ? sealed.subject.digests.sha256.toLowerCase()
      : null;
  const subjectKind = sealed.subject.type;
  const profile = sealed.profile ?? null;
  const claimSummary = summarizeClaims(sealed);

  const [row] = await db
    .insert(evidenceEnvelopes)
    .values({
      id,
      orgId,
      userId: apiKey.userId,
      apiKeyId: apiKey.id,
      profile,
      subjectSha256,
      subjectKind,
      envelope: sealed,
      envelopeDigest,
      claimSummary,
    })
    .returning();
  if (!row) throw new HttpError(500, "Insert returned no row", "internal_error");

  // Stamp `expires_at` from the org's retention window. Without this the
  // sweep is a permanent no-op (every row would have a NULL expiry).
  await applyRetentionToNewEnvelope(id, orgId, row.createdAt);

  await logActivity(
    apiKey.userId,
    serverSign ? "evidence_server_signed" : "evidence_sealed",
    {
      envelopeId: id,
      profile,
      subjectSha256,
    },
  );

  return {
    envelopeId: id,
    envelope: sealed,
    envelopeDigest,
    claimSummary,
    row: { ...row, envelope: row.envelope as EvidenceEnvelope },
  };
};

/** Fetch one envelope by id. Returns the row including the canonical
 *  envelope JSON. 404 when the envelope does not exist OR the caller is not
 *  a member of its org (no info leak across orgs). */
export const getEnvelopeById = async (
  apiKey: OrgApiKey,
  envelopeId: string,
) => {
  const orgId = requireOrgApiKey(apiKey);
  const [row] = await db
    .select()
    .from(evidenceEnvelopes)
    .where(
      and(
        eq(evidenceEnvelopes.id, envelopeId),
        eq(evidenceEnvelopes.orgId, orgId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new HttpError(404, "Envelope not found", "not_found");
  }
  return row;
};

/** Internal — used by the hosted `/cloud/verify/[envelopeId]` page which
 *  authorizes by user membership rather than API key. */
export const getEnvelopeRecordById = async (
  envelopeId: string,
  userOrgIds: string[],
) => {
  if (userOrgIds.length === 0) return null;
  const [row] = await db
    .select()
    .from(evidenceEnvelopes)
    .where(
      and(
        eq(evidenceEnvelopes.id, envelopeId),
        inArray(evidenceEnvelopes.orgId, userOrgIds),
      ),
    )
    .limit(1);
  return row ?? null;
};

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

export interface EvidenceSearchHit {
  envelopeId: string;
  profile: string | null;
  subjectSha256: string | null;
  createdAt: string;
  snippet: string;
  envelopeDigest: string;
}

/**
 * Postgres `websearch_to_tsquery` over the GIN-indexed `search_tsv` column,
 * ordered by `ts_rank` then `created_at`. Empty `query` returns the 20 most
 * recent envelopes for the org.
 */
export const searchEvidence = async (
  apiKey: OrgApiKey,
  query: string,
  { limit = 20 }: { limit?: number } = {},
): Promise<EvidenceSearchHit[]> => {
  const orgId = requireOrgApiKey(apiKey);
  const cappedLimit = Math.min(Math.max(limit, 1), 100);
  const trimmed = query.trim();

  // Empty query — fall through to a plain ordered list. We still scope by
  // org so a key never sees another org's rows.
  if (!trimmed) {
    const rows = await db
      .select({
        id: evidenceEnvelopes.id,
        profile: evidenceEnvelopes.profile,
        subjectSha256: evidenceEnvelopes.subjectSha256,
        envelopeDigest: evidenceEnvelopes.envelopeDigest,
        createdAt: evidenceEnvelopes.createdAt,
      })
      .from(evidenceEnvelopes)
      .where(eq(evidenceEnvelopes.orgId, orgId))
      .orderBy(desc(evidenceEnvelopes.createdAt))
      .limit(cappedLimit);
    return rows.map((r) => ({
      envelopeId: r.id,
      profile: r.profile,
      subjectSha256: r.subjectSha256,
      envelopeDigest: r.envelopeDigest,
      createdAt: r.createdAt.toISOString(),
      snippet: r.subjectSha256 ?? r.profile ?? "",
    }));
  }

  // Full-text search — `websearch_to_tsquery` accepts user-friendly
  // syntax ("quotes", OR, -negation). The `ts_rank` orders hits by
  // relevance; ties break on recency.
  const result = (await db.execute(sql`
    SELECT
      id,
      profile,
      subject_sha256,
      envelope_digest,
      created_at,
      ts_rank(search_tsv, websearch_to_tsquery('simple', ${trimmed})) AS rank,
      ts_headline(
        'simple',
        coalesce(profile, '') || ' ' || coalesce(subject_sha256, '') ||
          ' ' || coalesce(claim_summary->>'keys', '') || ' ' ||
          coalesce(claim_summary->>'signers', ''),
        websearch_to_tsquery('simple', ${trimmed}),
        'MaxFragments=1,MaxWords=15,MinWords=5,StartSel=<b>,StopSel=</b>'
      ) AS snippet
    FROM evidence_envelope
    WHERE org_id = ${orgId}
      AND search_tsv @@ websearch_to_tsquery('simple', ${trimmed})
    ORDER BY rank DESC, created_at DESC
    LIMIT ${cappedLimit}
  `)) as unknown as { rows?: Array<Record<string, unknown>> };
  const list = result.rows ?? [];

  return list.map((r) => ({
    envelopeId: String(r.id),
    profile: (r.profile as string | null) ?? null,
    subjectSha256: (r.subject_sha256 as string | null) ?? null,
    envelopeDigest: String(r.envelope_digest),
    createdAt: new Date(r.created_at as string | Date).toISOString(),
    snippet: String(r.snippet ?? ""),
  }));
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Derive a `claim_summary` from a validated envelope. Pure — used by
 * `submitEvidence` so search index coverage matches what production
 * writes look like.
 */
export const summarizeClaims = (
  envelope: EvidenceEnvelope,
): EvidenceClaimSummary => {
  const namespaces = new Set<string>();
  const keys: string[] = [];
  for (const [namespace, claims] of Object.entries(envelope.claims ?? {})) {
    namespaces.add(namespace);
    for (const key of Object.keys(claims ?? {})) {
      keys.push(`${namespace}.${key}`);
    }
  }

  const signers = new Set<string>();
  for (const sig of envelope.signatures ?? []) {
    if (sig.signer?.id) signers.add(sig.signer.id);
  }
  for (const sig of envelope.envelope?.signatures ?? []) {
    if (sig.signer?.id) signers.add(sig.signer.id);
  }

  return {
    keys: keys.sort(),
    namespaces: Array.from(namespaces).sort(),
    signers: Array.from(signers).sort(),
  };
};

/** Parse a JSON body and re-validate it as a protocol envelope. Throws
 *  `bad_request` (400) on either step so the route handler can return 400. */
export const parseEnvelopeBody = async (
  request: Request,
): Promise<EvidenceEnvelope> => {
  const raw = await request.text();
  if (!raw) throw new HttpError(400, "Empty request body", "bad_request");

  const envelope = parseEnvelope(raw);
  if (!envelope) {
    throw new HttpError(
      400,
      "Body is not a fileonchain-evidence envelope",
      "bad_request",
    );
  }
  return envelope;
};
