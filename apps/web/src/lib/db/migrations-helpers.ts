/**
 * Shared helpers for Drizzle migrations + seeds. The Cloud evidence build-out
 * uses a Postgres `tsvector` GENERATED column that Drizzle-ORM cannot express
 * natively; the expression lives here so the migration SQL and any seed/test
 * code use the same string. Keep this file additive only — never edit an
 * existing expression after a migration has shipped.
 */

/**
 * The expression that builds `evidence_envelope.search_tsv` from the indexed
 * columns. We concatenate the canonical search surfaces — subject digest,
 * profile id, signer ids, and the claim keys (flattened via
 * `jsonb_object_keys` over `claim_summary.namespaces`) — so a query against
 * `websearch_to_tsquery` can hit any of them with one GIN-indexed scan.
 *
 * Updates to this expression are migrations: re-generate with `db:generate`,
 * review the diff, hand-append the new `ALTER TABLE … ALTER COLUMN … SET
 * DATA TYPE … USING …` step.
 */
export const EVIDENCE_TSV_EXPRESSION = `
  setweight(to_tsvector('simple', coalesce(subject_sha256, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(profile, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce((claim_summary ->> 'signers'), '')), 'B') ||
  setweight(to_tsvector('simple', coalesce((claim_summary ->> 'keys'), '')), 'C')
`.trim();

/**
 * Default retention window in days, applied when an org has no
 * `retention_policy` row. The Cloud doc does not pin a number; 180 days
 * matches the v1 framing of "managed retention, configurable per org".
 */
export const DEFAULT_RETENTION_DAYS = 180;
