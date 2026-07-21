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
import { signEnvelopeForOrg, signEnvelopeForScope } from "@/lib/server/cloud-signer";
import { getProjectOrgId } from "@/lib/server/projects";
import { getEffectiveRetention } from "@/lib/server/retention";
import { enforceEnvelopeQuota } from "@/lib/server/quotas";
import { enqueueWebhookDeliveries } from "@/lib/server/webhooks";
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
  /**
   * When set, the envelope is bound to the named project. Project-scoped
   * API keys MUST carry a projectId; org-scoped keys may omit it (in
   * which case `projectId` must not be present). Throws 400 on a
   * mismatched pair and 404 when the project doesn't exist or belongs
   * to a different org.
   */
  projectId?: string;
  /**
   * When true, the Cloud adds an *envelope* signature with the project's
   * active `service` signer instead of the org's. Requires the
   * `projectId` to be set and the project to have generated a Cloud
   * signer first; throws 409 otherwise.
   */
  serverSignProject?: boolean;
}

/**
 * Validate and store an envelope. Recomputes the envelope digest server-
 * side so the row carries the protocol's canonical value, and derives the
 * claim summary so the GIN-indexed search column has data to index. When
 * `serverSign` is set, the org's Cloud signer adds an envelope signature
 * first — the digest is unaffected (envelope signatures live outside the
 * digested region), so the stored digest is the protocol's value either way.
 *
 * Project-scoped envelopes flow through the same path with extra
 * authorization (`projectId` matches the API key's project scope) and an
 * optional `serverSignProject` opt-in that signs with the project's own
 * service key (so a project can attribute the envelope-seal step to its
 * own identity rather than the org's).
 *
 * TODO(kcd): credits debit. Ingestion is currently free; the cost is the
 * block of bytes the caller already paid to seal, not Cloud storage.
 */
export const submitEvidence = async (
  apiKey: OrgApiKey,
  {
    envelope,
    serverSign = false,
    projectId,
    serverSignProject = false,
  }: SubmitEvidenceInput,
) => {
  const orgId = requireOrgApiKey(apiKey);

  // Project scope resolution: the body declares the project, the key
  // declares its own project scope. We require them to match.
  let effectiveProjectId: string | null = null;
  if (projectId !== undefined && projectId !== null) {
    if (apiKey.scope !== "project" || apiKey.projectId !== projectId) {
      throw new HttpError(
        400,
        "When `project` is set, the API key must be project-scoped to that project",
        "bad_request",
      );
    }
    const projectOrgId = await getProjectOrgId(projectId);
    if (!projectOrgId || projectOrgId !== orgId) {
      throw new HttpError(404, "Project not found", "not_found");
    }
    effectiveProjectId = projectId;
  } else if (apiKey.scope === "project") {
    // Project-scoped key with no project in the body — bind it to the
    // key's project implicitly so the envelope always lands under the
    // right tenancy counter.
    effectiveProjectId = apiKey.projectId;
  }

  // Quota check before any envelope work so over-cap requests fail
  // fast with a structured 429, never a half-written row.
  await enforceEnvelopeQuota(effectiveProjectId);

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

  // Server-side sealing: project scope takes precedence over org scope
  // when both opts are set, because the project's `service` identity is
  // the most specific claim the Cloud can make. Throws 409 when the
  // scope has no active signer.
  let sealed: EvidenceEnvelope = envelope;
  if (effectiveProjectId && serverSignProject) {
    sealed = await signEnvelopeForScope(
      {
        kind: "project",
        orgId,
        projectId: effectiveProjectId,
      },
      envelope,
    );
  } else if (serverSign) {
    sealed = await signEnvelopeForOrg(orgId, envelope);
  }

  const id = crypto.randomUUID();
  const envelopeDigest = computeEnvelopeDigest(sealed);
  const subjectSha256 =
    typeof sealed.subject.digests?.sha256 === "string"
      ? sealed.subject.digests.sha256.toLowerCase()
      : null;
  const subjectKind = sealed.subject.type;
  const profile = sealed.profile ?? null;
  const claimSummary = summarizeClaims(sealed);

  // Resolve the retention window pre-insert so we can bake
  // `expires_at` into the row directly. Avoids a separate UPDATE +
  // `applyRetentionToNewEnvelope` round trip, and closes a window
  // where a transient DB error after the INSERT would leave the row
  // with `expires_at IS NULL` — invisible to the sweep forever.
  // The `Default` fallback (`windowDays` from `DEFAULT_RETENTION_DAYS`)
  // matches the old function's behavior, so this is a refactor, not
  // a behavior change.
  const { windowDays } = await getEffectiveRetention(orgId);
  const createdAt = new Date();
  const expiresAt = new Date(
    createdAt.getTime() + windowDays * 24 * 60 * 60 * 1000,
  );

  const [row] = await db
    .insert(evidenceEnvelopes)
    .values({
      id,
      orgId,
      userId: apiKey.userId,
      apiKeyId: apiKey.id,
      projectId: effectiveProjectId,
      profile,
      subjectSha256,
      subjectKind,
      envelope: sealed,
      envelopeDigest,
      claimSummary,
      expiresAt,
    })
    .returning();
  if (!row) throw new HttpError(500, "Insert returned no row", "internal_error");

  await logActivity(
    apiKey.userId,
    serverSign ? "evidence_server_signed" : "evidence_sealed",
    {
      envelopeId: id,
      profile,
      subjectSha256,
    },
  );

  // Webhook fan-out. Fire-and-forget: the call catches its own errors
  // and returns, so an outage at a webhook receiver never blocks the
  // ingest path or rolls back the row.
  void enqueueWebhookDeliveries(orgId, "evidence.sealed", id, {
    envelopeId: id,
    profile,
    subjectSha256,
    subjectKind,
    envelopeDigest,
    projectId: effectiveProjectId,
    serverSign,
    serverSignProject,
  });

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
