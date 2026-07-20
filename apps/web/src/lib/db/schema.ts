import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { AdapterAccountType } from "next-auth/adapters";
import type { ChainFamily, ChainId } from "@fileonchain/sdk";
// Relative import (not "@/…") so drizzle-kit can bundle the schema.
import type { DateFormatPreference } from "../preferences";

/**
 * Single source of truth for the account system's Postgres schema (Neon).
 * Monetary amounts are stored as bigint micro-USDC (6 decimals) to match
 * the on-chain `CachePayments.sol` USDC precision.
 *
 * Migrations are generated with `pnpm --filter @fileonchain/web db:generate`
 * and live in `apps/web/drizzle/`.
 */

const uuid = () => crypto.randomUUID();

/* ------------------------------------------------------------------ */
/* Auth.js standard tables — shapes required by @auth/drizzle-adapter. */
/* ------------------------------------------------------------------ */

export const users = pgTable("user", {
  id: text("id").primaryKey().$defaultFn(uuid),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

/* ------------------------------------------------------------------ */
/* Domain tables.                                                      */
/* ------------------------------------------------------------------ */

/** A wallet linked to a user, proven by a verified sign-message. */
export const wallets = pgTable(
  "wallet",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    family: text("family").$type<ChainFamily>().notNull(),
    address: text("address").notNull(),
    /** Raw public key — needed for solana/aptos/substrate verification audits. */
    publicKey: text("public_key"),
    signature: text("signature").notNull(),
    message: text("message").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // An address can belong to exactly one user…
    uniqueIndex("wallet_family_address_unique").on(t.family, t.address),
    // …and a user holds one wallet per runtime family (matches useIdentityStates).
    uniqueIndex("wallet_user_family_unique").on(t.userId, t.family),
  ],
);

/** Single-use nonces for wallet sign-in / linking challenges. */
export const authNonces = pgTable("auth_nonce", {
  nonce: text("nonce").primaryKey(),
  family: text("family").$type<ChainFamily>().notNull(),
  address: text("address").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** `scope` distinguishes a personal API key from an org-scoped one.
 *  `personal` keys (default) can only hit user-scoped endpoints
 *  (`/api/v1/anchor`, `/api/v1/credits`). `org` keys additionally hold an
 *  `orgId` and are required by the Cloud evidence surface
 *  (`/api/v1/evidence`, `/api/v1/agent-runs`, `/api/v1/verify`,
 *  `/api/v1/retention`). `project` keys additionally hold a `projectId`
 *  and can only seal into that project. The `scope` column is
 *  denormalized from `orgId IS NOT NULL` / `projectId IS NOT NULL` so we
 *  can index / filter on it without the IS NOT NULL dance. */
export type ApiKeyScope = "personal" | "org" | "project";

/** API keys — only the SHA-256 hash is stored; plaintext is shown once. */
export const apiKeys = pgTable(
  "api_key",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Display prefix, e.g. `fok_a1b2c3d4` — enough to recognize, not to use. */
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    /** Optional org tenancy — set for org-scoped keys; NULL for personal keys. */
    orgId: text("org_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    /** Optional project tenancy — set for project-scoped keys; NULL
     *  otherwise. Requires `orgId` to also be set (the project belongs to
     *  an org). Cascade with the parent project; the FK is hand-appended
     *  in the migration because the `project` table is declared below. */
    projectId: text("project_id"),
    /** Denormalized `personal` | `org` | `project`. Defaults to
     *  `personal`. Backed by a CHECK constraint at the DB layer so a bad
     *  write can't escape the enum. */
    scope: text("scope").$type<ApiKeyScope>().notNull().default("personal"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("api_key_user_created_idx").on(t.userId, t.createdAt),
    index("api_key_org_idx").on(t.orgId),
    index("api_key_project_idx").on(t.projectId),
  ],
);

export type CreditReason = "deposit" | "anchor_debit" | "refund" | "adjustment";

/** Append-only credit ledger; balance = SUM(delta_micro_usdc). */
/* TODO: materialize a cached balance column once ledgers grow large. */
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deltaMicroUsdc: bigint("delta_micro_usdc", { mode: "bigint" }).notNull(),
    reason: text("reason").$type<CreditReason>().notNull(),
    /** What this entry references, e.g. `deposit` / `upload_job`. */
    refType: text("ref_type"),
    refId: text("ref_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("credit_ledger_user_created_idx").on(t.userId, t.createdAt)],
);

export type DepositStatus = "pending" | "confirmed" | "failed";

/** USDC deposit intents. Confirmation is real on chains whose `usdcContract`
 *  is provisioned; the `/api/cron/deposits-watch` cron matches inbound
 *  Transfer events against the pending deposit rows. The
 *  `(user_id, status, created_at)` index powers the watcher; the
 *  unique `tx_hash` index makes a single hash claim a single deposit
 *  race-free (manual confirm + auto watcher can never double-credit). */
export const deposits = pgTable(
  "deposit",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    chainId: text("chain_id").$type<ChainId>().notNull(),
    amountMicroUsdc: bigint("amount_micro_usdc", { mode: "bigint" }).notNull(),
    /** Per-user deposit address derived deterministically from
     *  `(userId, chainId)` — see `api/credits/deposit/route.ts`. */
    depositAddress: text("deposit_address").notNull(),
    status: text("status").$type<DepositStatus>().notNull().default("pending"),
    txHash: text("tx_hash"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("deposit_user_status_idx").on(t.userId, t.status, t.createdAt),
    uniqueIndex("deposit_tx_hash_unique").on(t.txHash),
  ],
);

export type ActivityType =
  | "sign_in"
  | "wallet_linked"
  | "wallet_unlinked"
  | "credit_deposit"
  | "credit_debit"
  | "upload_anchor"
  | "api_call"
  | "api_key_created"
  | "api_key_revoked"
  | "byok_added"
  | "byok_removed"
  | "rpc_endpoint_updated"
  | "rpc_endpoint_removed"
  | "preferences_updated"
  | "org_created"
  | "org_renamed"
  | "org_deleted"
  | "org_member_added"
  | "org_member_removed"
  | "evidence_sealed"
  | "agent_run_sealed"
  | "evidence_verified"
  | "evidence_server_signed"
  | "retention_updated"
  | "cloud_signer_generated"
  | "cloud_signer_revoked"
  | "project_created"
  | "project_renamed"
  | "project_deleted"
  | "project_member_added"
  | "project_member_removed"
  | "project_quotas_updated"
  | "webhook_created"
  | "webhook_updated"
  | "webhook_revoked"
  | "webhook_secret_rotated"
  | "webhook_delivery_failed"
  | "export_requested"
  | "export_completed"
  | "export_downloaded"
  | "compliance_report_generated"
  | "compliance_report_downloaded"
  | "sla_tier_changed"
  | "deposit_auto_confirmed"
  | "deposit_confirm_failed";

export type ActivityMetadata = Record<string, string | number | boolean | null>;

/** Per-user activity/audit log rendered on /dashboard/logs. */
export const activityLogs = pgTable(
  "activity_log",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<ActivityType>().notNull(),
    metadata: jsonb("metadata").$type<ActivityMetadata>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("activity_log_user_created_idx").on(t.userId, t.createdAt)],
);

export type ByokProvider = "autonomys-auto-drive";
export type ByokStatus = "unverified" | "valid" | "invalid";

/** Bring-your-own-key provider credentials, AES-256-GCM encrypted at rest. */
export const byokKeys = pgTable("byok_key", {
  id: text("id").primaryKey().$defaultFn(uuid),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").$type<ByokProvider>().notNull(),
  label: text("label").notNull(),
  /** `iv.ciphertext.tag`, each segment base64 — see lib/crypto/secretbox.ts. */
  encryptedKey: text("encrypted_key").notNull(),
  /** Last 4 characters of the plaintext key, for display only. */
  keyPreview: text("key_preview").notNull(),
  status: text("status").$type<ByokStatus>().notNull().default("unverified"),
  lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

/**
 * Per-chain custom RPC endpoints ("bring your own RPC"). Plain URLs — not
 * secrets, so no encryption (unlike `byok_key`). Validated against
 * `lib/rpc-endpoints.ts` `validateRpcUrl` at write time; consumed by the
 * browser anchor senders and the server anchor worker via `withRpcOverride`.
 */
export const customRpcEndpoints = pgTable(
  "custom_rpc",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    chainId: text("chain_id").$type<ChainId>().notNull(),
    url: text("url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("custom_rpc_user_chain_idx").on(t.userId, t.chainId)],
);

/**
 * Per-user account preferences, one row per user created lazily on first
 * write. UI defaults for missing rows live in `lib/preferences.ts`
 * (`DEFAULT_PREFERENCES`) — keep column defaults in sync with it.
 */
export const userPreferences = pgTable("user_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Public handle, lowercase, unique across the platform. */
  username: text("username").unique(),
  showTestnets: boolean("show_testnets").notNull().default(false),
  dateFormat: text("date_format")
    .$type<DateFormatPreference>()
    .notNull()
    .default("locale"),
  analyticsEnabled: boolean("analytics_enabled").notNull().default(true),
  uploadAdvisorEnabled: boolean("upload_advisor_enabled")
    .notNull()
    .default(true),
  notifyUploadComplete: boolean("notify_upload_complete")
    .notNull()
    .default(true),
  notifyLowCredit: boolean("notify_low_credit").notNull().default(true),
  notifyPromotions: boolean("notify_promotions").notNull().default(false),
  notifyNewsletter: boolean("notify_newsletter").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type OrganizationRole = "owner" | "admin" | "member";

/** A team workspace. The owner also appears in `organization_member`. */
export const organizations = pgTable("organization", {
  id: text("id").primaryKey().$defaultFn(uuid),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const organizationMembers = pgTable(
  "organization_member",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<OrganizationRole>().notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.orgId, t.userId] }),
    index("organization_member_user_idx").on(t.userId),
  ],
);

export type UploadJobStatus = "pending" | "anchoring" | "complete" | "failed";
export type UploadPaymentMethod = "credits" | "byok";

export interface UploadJobTx {
  chainId: ChainId;
  txHash: string;
  blockNumber: number;
}

/** Server-side anchoring jobs (credits or BYOK payment flows). */
export const uploadJobs = pgTable(
  "upload_job",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    apiKeyId: text("api_key_id").references(() => apiKeys.id),
    byokKeyId: text("byok_key_id").references(() => byokKeys.id),
    /** Optional project tenancy — set when the job seals for a project.
     *  Cascade with the parent project; the FK is hand-appended in the
     *  migration because the `project` table is declared below. */
    projectId: text("project_id"),
    cid: text("cid").notNull(),
    fileName: text("file_name").notNull(),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }).notNull(),
    chunkCount: integer("chunk_count").notNull(),
    chainIds: jsonb("chain_ids").$type<ChainId[]>().notNull(),
    paymentMethod: text("payment_method")
      .$type<UploadPaymentMethod>()
      .notNull(),
    status: text("status").$type<UploadJobStatus>().notNull().default("pending"),
    costMicroUsdc: bigint("cost_micro_usdc", { mode: "bigint" }).notNull(),
    txHashes: jsonb("tx_hashes").$type<UploadJobTx[]>().notNull().default([]),
    /** Originating platform id carried in anchor payloads (attribution only). */
    platformId: text("platform_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("upload_job_user_created_idx").on(t.userId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Cloud evidence surface (gated behind FILEONCHAIN_CLOUD_EVIDENCE_ENABLED).
 * Per-org tenancy: every envelope and every agent run belongs to exactly one
 * org. The Cloud-only fields (orgId, expiresAt, verificationCount,
 * lastVerifiedAt, apiKeyId, userId) live in DB columns only — they MUST
 * NEVER be inserted into the envelope JSON itself (CLAUDE.md:411-413). */
/* ------------------------------------------------------------------ */

export interface EvidenceClaimSummary {
  /** Profile-namespaced claim keys, e.g. `["run", "run.model", "run.toolCalls"]`. */
  keys: string[];
  /** Profile ids present in the envelope, e.g. `["org.fileonchain.agent/v1"]`. */
  namespaces: string[];
  /** Distinct signer ids across artifact and envelope signatures. */
  signers: string[];
}

/**
 * A sealed protocol `EvidenceEnvelope` stored server-side so the Cloud can
 * expose search, retention, and hosted verification. The row carries the
 * canonical envelope JSON plus the derived columns the protocol guarantees
 * (envelope digest, subject sha256, profile id) so a search or retention
 * sweep does not have to re-parse JSONB. The `search_tsv` column is a
 * Postgres `GENERATED ALWAYS AS (…) STORED` `tsvector` built by the
 * migration; Drizzle-ORM cannot express generated columns natively so the
 * migration adds it as a hand-appended `ALTER TABLE`.
 */
export const evidenceEnvelopes = pgTable(
  "evidence_envelope",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Creator / uploader — audit only; the authoritative ownership is orgId. */
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** API key used at submission, when applicable — audit only. */
    apiKeyId: text("api_key_id").references(() => apiKeys.id),
    /** Optional project tenancy — set when the envelope belongs to a
     *  project. Quota counters key off this column (the source of truth
     *  is `evidence_envelope.project_id`, not a separate counter table).
     *  Cascade with the parent project; the FK is hand-appended in the
     *  migration because the `project` table is declared below. */
    projectId: text("project_id"),
    /** Profile id from the envelope, e.g. `org.fileonchain.agent/v1`. */
    profile: text("profile"),
    /**
     * Subject SHA-256 digest (lowercase hex), extracted from
     * `envelope.subject.digests.sha256`. NULL when the envelope's subject
     * declares no SHA-256 digest (subjects may carry other algorithms).
     */
    subjectSha256: text("subject_sha256"),
    /** `envelope.subject.type` — one of the SubjectDescriptor kinds. */
    subjectKind: text("subject_kind"),
    /** Canonical `EvidenceEnvelope` JSON, exactly as submitted. Drizzle
     *  jsonb is typed `unknown` here; service code casts to
     *  `EvidenceEnvelope` at the boundary (the envelope was validated by
     *  `validateEnvelope` at insert time). */
    envelope: jsonb("envelope").notNull(),
    /**
     * `computeEnvelopeDigest(envelope)` — SHA-256 lowercase hex of the
     * canonical envelope minus its `envelope` member. Recomputed server-side
     * before insert so the row carries the protocol's digest of record.
     */
    envelopeDigest: text("envelope_digest").notNull(),
    /**
     * Denormalized claim summary so the search index doesn't have to
     * descend into the envelope JSON on every query. See
     * `EvidenceClaimSummary` — Cloud-only metadata, never present in the
     * envelope itself.
     */
    claimSummary: jsonb("claim_summary")
      .$type<EvidenceClaimSummary>()
      .notNull()
      .default({ keys: [], namespaces: [], signers: [] }),
    /**
     * `tsvector` built from subjectSha256 + profile + signer/claim keys by
     * the migration's `GENERATED ALWAYS AS (…) STORED` clause; the search
     * route queries this column via `websearch_to_tsquery`.
     */
    // searchTsv is added by the migration — see migrations-helpers.ts
    /** Retention sweep target — NULL means "no expiry configured". */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Increments every time `/api/v1/verify` (case A) re-verifies the row. */
    verificationCount: integer("verification_count").notNull().default(0),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("evidence_envelope_org_created_idx").on(t.orgId, t.createdAt),
    index("evidence_envelope_subject_idx").on(t.subjectSha256),
    index("evidence_envelope_project_idx").on(t.projectId),
  ],
);

/**
 * One row per Agent Evidence `runId` submitted to the Cloud. The run row
 * is the join key for `/api/v1/agent-runs/:runId` and is uniquely tied to
 * one envelope; resubmitting the same (runId, agentId) pair with a new
 * envelope creates a second row (idempotency key is the full triple).
 */
export const agentRuns = pgTable(
  "agent_run",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Creator / uploader — audit only. */
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** `AgentClaims.runId`. NOT the envelope id; one run can span runs. */
    runId: text("run_id").notNull(),
    /** `AgentClaims.agentId`. */
    agentId: text("agent_id").notNull(),
    /** The envelope that sealed this run. Cascade-on-delete matches the
     * envelope retention sweep. */
    envelopeId: text("envelope_id")
      .notNull()
      .references(() => evidenceEnvelopes.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("agent_run_org_created_idx").on(t.orgId, t.createdAt),
    index("agent_run_run_idx").on(t.runId),
    uniqueIndex("agent_run_org_run_envelope_unique").on(
      t.orgId,
      t.runId,
      t.envelopeId,
    ),
  ],
);

/**
 * Per-org retention window for stored envelopes. NULL row means "use the
 * `DEFAULT_RETENTION_DAYS` constant". The retention sweep deletes any
 * `evidence_envelope` whose `expires_at < now()` — it does NOT consult
 * this table at sweep time, so a policy change only affects newly sealed
 * envelopes; existing envelopes retain their original expiry. Apply
 * proactively with a sweep + reseed if a shorter window is needed.
 */
export const retentionPolicies = pgTable("retention_policy", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  /** Days from `evidence_envelope.createdAt` before the envelope expires. */
  windowDays: integer("window_days").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type CloudSignerScheme = "ed25519";

/**
 * Per-org (or per-project) Cloud signing key used for server-side
 * envelope sealing (`server_sign` / `server_sign_project`). The Cloud
 * adds an ENVELOPE signature — a `service` signer identity attesting it
 * assembled/exported the envelope — never an artifact signature (which
 * would claim authorship of the subject). The ed25519 seed is sealed at
 * rest with `lib/crypto/secretbox.ts` (same `iv.ciphertext.tag` base64
 * format as `byok_key`). The public key is exposed unauthenticated at
 * `/api/cloud/signer/[orgId]` (and at `/api/cloud/signer/project/[projectId]`)
 * so verifiers can resolve `keyStatusUrl`. Rotation revokes the current
 * row (sets `revoked_at`) and inserts a new one; partial unique indexes
 * enforce at most one active (`revoked_at IS NULL`) signer per org
 * (when `project_id IS NULL`) and one active per project (when
 * `project_id IS NOT NULL`).
 */
export const cloudSigners = pgTable(
  "cloud_signer",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Optional project tenancy — NULL means this is the org's service
     *  signer; otherwise it is the project's service signer (and the org
     *  link is implied via projects.org_id). Cascade with the parent
     *  project; the FK is hand-appended in the migration because the
     *  `project` table is declared below. */
    projectId: text("project_id"),
    scheme: text("scheme").$type<CloudSignerScheme>().notNull().default("ed25519"),
    /** 32-byte lowercase-hex ed25519 public key (the verifiable identity). */
    publicKey: text("public_key").notNull(),
    /** Sealed ed25519 seed — `iv.ciphertext.tag`, base64. See secretbox.ts. */
    encryptedSecret: text("encrypted_secret").notNull(),
    /** First 8 hex chars of the public key, for display only. */
    keyPreview: text("key_preview").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    index("cloud_signer_org_idx").on(t.orgId),
    index("cloud_signer_project_idx").on(t.projectId),
  ],
);

/* ------------------------------------------------------------------ */
/* Project tenancy (gated behind FILEONCHAIN_CLOUD_TENANCY_ENABLED).
 *
 * A project is a sub-org unit: every project row belongs to one org, and
 * members of that project are automatically members of the parent org
 * (the membership row is never duplicated — the project view filters
 * down from the org). Project roles are `lead` (manages quotas + signer
 * + keys + members) and `contributor` (can seal into the project).
 *
 * All Cloud-only fields on these tables (project_id columns on
 * evidence_envelope / upload_job / api_key / cloud_signer, quota
 * counters read from those columns, project-scoped Cloud signers) live in
 * DB columns only — they are NEVER inserted into the envelope JSON
 * itself (CLAUDE.md:411-413). The same rule that applies to org tenancy
 * extends one level down.                                         */
/* ------------------------------------------------------------------ */

export type ProjectRole = "lead" | "contributor";

/** A project is a tenancy bucket inside an org. Slug-unique inside the
 *  parent org; member-lead is the project creator. */
export const projects = pgTable(
  "project",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Per-project retention override. NULL = inherit the org's
     *  `retention_policy` (or the global default). */
    retentionDays: integer("retention_days"),
    /** Soft caps — all NULL means unlimited. Enforced in
     *  `submitEvidence` (envelopesPerMonth) and `anchorWithAccount`
     *  (anchorsPerMonth + bytesAnchoredPerMonth). The counter is the row
     *  count on `evidence_envelope.project_id` / `upload_job.project_id`,
     *  not a separate counter table — `server_sign_project` is not needed
     *  to make this work. */
    envelopesPerMonth: integer("envelopes_per_month"),
    anchorsPerMonth: integer("anchors_per_month"),
    bytesAnchoredPerMonth: bigint("bytes_anchored_per_month", {
      mode: "number",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("project_org_slug_unique").on(t.orgId, t.slug),
    index("project_org_idx").on(t.orgId),
  ],
);

/** Project membership — separate from `organization_member` so the
 *  project roles can vary independently of org membership. Project
 *  members must already be members of the parent org; the service layer
 *  enforces that (it rejects adds that would create an inconsistent
 *  view). */
export const projectMembers = pgTable(
  "project_member",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<ProjectRole>().notNull().default("contributor"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    index("project_member_user_idx").on(t.userId),
  ],
);

/* ------------------------------------------------------------------ */
/* Webhooks (gated behind FILEONCHAIN_CLOUD_WEBHOOKS_ENABLED).         */
/* ------------------------------------------------------------------ */

export type WebhookEventType =
  | "evidence.sealed"
  | "evidence.verified"
  | "evidence.expired"
  | "agent_run.sealed"
  | "anchor.job.settled"
  | "signer.rotated"
  | "signer.revoked"
  | "compliance_report.generated";

/** An org's outbound webhook target. The signing secret is shown to the
 *  caller exactly once at creation; the column stores its SHA-256 hex
 *  digest so the server can detect leaks by comparing — but the actual
 *  HMAC needs the plaintext (so the column actually holds the plaintext,
 *  AES-256-GCM sealed just like BYOK and the Cloud signer seeds). See
 *  `apps/web/src/lib/crypto/secretbox.ts`. */
export const webhookEndpoints = pgTable(
  "webhook_endpoint",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    description: text("description").notNull().default(""),
    /** Sealed HMAC secret — `iv.ciphertext.tag`, base64. Same secretbox
     *  format as BYOK / Cloud signers. */
    encryptedSecret: text("encrypted_secret").notNull(),
    /** Last 4 chars of the plaintext secret, for display only. */
    secretPreview: text("secret_preview").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
  },
  (t) => [
    index("webhook_endpoint_org_idx").on(t.orgId),
  ],
);

/** Event subscriptions per endpoint. A subscription exists for each
 *  `(endpoint, event_type)` the org has opted into; the deliveries table
 *  fans out from the endpoint's subscriptions. */
export const webhookSubscriptions = pgTable(
  "webhook_subscription",
  {
    endpointId: text("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    eventType: text("event_type").$type<WebhookEventType>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.endpointId, t.eventType] }),
  ],
);

/** One row per attempted delivery. The unique index on
 *  `(endpoint_id, event_id)` is the fan-out idempotency key —
 *  `enqueueWebhookDeliveries` re-runs are safe. `next_attempt_at` is the
 *  drain cursor and the exponential backoff target. `delivered_at IS
 *  NOT NULL` is the terminal success state; `attempts > 5` AND
 *  `delivered_at IS NULL` is the terminal failure state. */
export const webhookDeliveries = pgTable(
  "webhook_delivery",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    endpointId: text("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    /** Caller-supplied event id (e.g. the envelope's id, the anchor
     *  job's id, the compliance report's id). Stable across re-deliveries. */
    eventId: text("event_id").notNull(),
    eventType: text("event_type").$type<WebhookEventType>().notNull(),
    /** JSON body sent to the endpoint (canonical, signed). */
    payload: jsonb("payload").notNull(),
    attempts: integer("attempts").notNull().default(0),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("webhook_delivery_endpoint_event_unique").on(
      t.endpointId,
      t.eventId,
    ),
    index("webhook_delivery_due_idx")
      .on(t.nextAttemptAt)
      .where(sql`${t.deliveredAt} IS NULL`),
  ],
);

/* ------------------------------------------------------------------ */
/* Bulk `.evidence.json` exports (gated behind FILEONCHAIN_CLOUD_EXPORTS_ENABLED).
 *
 * A request becomes a build job (cursor-paginated reads of
 * `evidence_envelope`, streamed into a server-local .zip). When the
 * build is complete the row carries a one-time download token; the
 * route at `/api/v1/exports/[id]/download` validates the token and
 * streams the file. A daily cron sweeps rows past `expires_at` and
 * deletes their server-local files.                                  */
/* ------------------------------------------------------------------ */

export type ExportJobStatus =
  | "pending"
  | "building"
  | "ready"
  | "expired"
  | "failed";

export type ExportFormat = "zip";

/** Filter shape posted by the API caller. All fields optional; an empty
 *  filter exports every envelope in the (org, project) scope. */
export interface ExportJobFilter {
  from?: string;
  to?: string;
  profile?: string;
  signerIds?: string[];
}

export const exportJobs = pgTable(
  "export_job",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Optional project scope — NULL means the org's full set. */
    projectId: text("project_id"),
    requestedByUserId: text("requested_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    filter: jsonb("filter").$type<ExportJobFilter>().notNull().default({}),
    format: text("format").$type<ExportFormat>().notNull().default("zip"),
    /** When true, the build also emits an `agent-runs.json` index that
     *  resolves each `runId` to its current envelope digest list. */
    includeAgentRunIndex: boolean("include_agent_run_index")
      .notNull()
      .default(false),
    status: text("status").$type<ExportJobStatus>().notNull().default("pending"),
    envelopeCount: integer("envelope_count").notNull().default(0),
    byteSize: bigint("byte_size", { mode: "number" }).notNull().default(0),
    /** Server-local file path on the worker's filesystem (per-row;
     *  cleaned up by `exports-sweep`). */
    filePath: text("file_path"),
    /** Opaque single-use token the download route checks against the
     *  URL path so the link is not guessable. */
    downloadToken: text("download_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("export_job_org_created_idx").on(t.orgId, t.createdAt),
    index("export_job_expires_idx").on(t.expiresAt),
  ],
);

/* ------------------------------------------------------------------ */
/* Compliance reports + tier-based SLAs (gated behind FILEONCHAIN_CLOUD_COMPLIANCE_ENABLED).
 *
 * `org_sla` is one row per org, seeded `tier: 'free'` at org creation.
 * Tier changes are admin-only. The report body is a JSON summary
 * computed from `evidence_envelope` + `upload_job` + `agent_run` over
 * the requested period; the Cloud signs it with the org's
 * `service` signer (envelope signature only — never artifact), so the
 * row carries the canonical `envelope_digest` of the report envelope.  */
/* ------------------------------------------------------------------ */

export type OrgTier = "free" | "team" | "enterprise";

/** Per-org SLA. Seeded by `organizations.service` on create. */
export const orgSlas = pgTable(
  "org_sla",
  {
    orgId: text("org_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tier: text("tier").$type<OrgTier>().notNull().default("free"),
    /** Optional soft caps surfaced on tier upgrade; the quota engine
     *  ignores these when null so teams / enterprise are not throttled
     *  unless the org opts in to a cap. */
    monthlyEnvelopesLimit: integer("monthly_envelopes_limit"),
    monthlyAnchorsLimit: integer("monthly_anchors_limit"),
    /** Promise — the dashboard plots this against rolling-window
     *  observations; the surface never claims the promise was met
     *  unless a delivered report covers the period. */
    monthlyUptimePct: integer("monthly_uptime_pct").notNull().default(9900),
    settlementLatencyP95Ms: integer("settlement_latency_p95_ms")
      .notNull()
      .default(60000),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const complianceReports = pgTable(
  "compliance_report",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** NULL when generated by the cron (system-generated). */
    generatedByUserId: text("generated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Canonical `EvidenceEnvelope` JSON of the report body, with the
     *  org's `service` signer envelope signature attached. The
     *  envelope's `subject` carries the report id and period bounds. */
    envelope: jsonb("envelope").notNull(),
    envelopeDigest: text("envelope_digest").notNull(),
  },
  (t) => [
    index("compliance_report_org_generated_idx").on(t.orgId, t.generatedAt),
    index("compliance_report_org_period_idx").on(
      t.orgId,
      t.periodStart,
      t.periodEnd,
    ),
  ],
);

/* ------------------------------------------------------------------ */
/* Indexer (anchored events written by `/api/cron/indexer-scan`).
 *
 * One row per on-chain `anchorChunk` / `anchorCID` event observed on a
 * provisioned EVM chain. The `(chain_id, tx_hash, log_index)` unique
 * triple is the dedup key (a chain reorg or a duplicate cron run cannot
 * produce two rows for the same log entry). `payload` is the parsed
 * `AnchorPayload` JSON — see `lib/indexer/queries.ts` for the read
 * side, `lib/indexer/scan.ts` for the write side. The
 * `(cid, block_timestamp DESC)` index powers the explorer feed; the
 * `(submitter, block_timestamp DESC)` index powers the leaderboard.   */
/* ------------------------------------------------------------------ */

export type AnchorEventStatus = "anchored" | "pending" | "failed";

export const indexedAnchorEvents = pgTable(
  "indexed_anchor_event",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    chainId: text("chain_id").$type<ChainId>().notNull(),
    cid: text("cid").notNull(),
    registryAddress: text("registry_address").notNull(),
    txHash: text("tx_hash").notNull(),
    logIndex: integer("log_index").notNull(),
    blockNumber: bigint("block_number", { mode: "number" }).notNull(),
    /** Block timestamp in seconds since the epoch (per EVM convention). */
    blockTimestamp: timestamp("block_timestamp", { withTimezone: true }).notNull(),
    submitter: text("submitter").notNull(),
    /** Parsed `AnchorPayload` JSON from `parseAnchorPayload`. */
    payload: jsonb("payload").notNull(),
    status: text("status").$type<AnchorEventStatus>().notNull().default("anchored"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("indexed_anchor_event_chain_tx_log_unique").on(
      t.chainId,
      t.txHash,
      t.logIndex,
    ),
    index("indexed_anchor_event_cid_idx").on(t.cid, t.blockTimestamp),
    index("indexed_anchor_event_submitter_idx").on(t.submitter, t.blockTimestamp),
  ],
);

/** Per-chain head pointer for the indexer. The scan reads
 *  `last_scanned_block + 1` on each tick and writes back the highest
 *  block it observed. Reorgs aren't rolled back (we keep already-seen
 *  rows); the unique `(chain_id, tx_hash, log_index)` index guarantees
 *  a re-scan can't duplicate events.                                  */
export const indexerCursors = pgTable("indexer_cursor", {
  chainId: text("chain_id").$type<ChainId>().primaryKey(),
  lastScannedBlock: bigint("last_scanned_block", { mode: "number" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Deposit watcher cursor (drives `/api/cron/deposits-watch`).
 *
 * Same shape as the indexer cursor: per-chain head pointer for the USDC
 * Transfer-event scan. The watcher also reads `deposit` rows whose
 * `status = 'pending'` to discover the deposit addresses it should
 * match on (no separate address list).                                */
/* ------------------------------------------------------------------ */

export const depositCursors = pgTable("deposit_cursor", {
  chainId: text("chain_id").$type<ChainId>().primaryKey(),
  lastScannedBlock: bigint("last_scanned_block", { mode: "number" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ------------------------------------------------------------------ */
/* API rate limits (drives `enforceApiKeyRateLimit` /
 * `enforceIpRateLimit` called from `authenticateApiKey`).
 *
 * Sliding minute window: `window_start` is the floor of `now()` to the
 * nearest minute. `(scope_kind, scope_id, endpoint, window_start)` is
 * the dedup key for the atomic UPSERT counter. The cron
 * `rate-limit-sweep` deletes windows older than the longest configured
 * window so the table stays bounded.                                */
/* ------------------------------------------------------------------ */

export type RateLimitScope = "api_key" | "ip";

export const rateLimitWindows = pgTable(
  "rate_limit_window",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    scopeKind: text("scope_kind").$type<RateLimitScope>().notNull(),
    /** `api_key.id` or client IP. */
    scopeId: text("scope_id").notNull(),
    /** Stable endpoint key, e.g. "POST /api/v1/anchor". Path params
     *  are normalized out so `[id]` doesn't fragment the bucket. */
    endpoint: text("endpoint").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    requestCount: integer("request_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("rate_limit_window_scope_endpoint_window_unique").on(
      t.scopeKind,
      t.scopeId,
      t.endpoint,
      t.windowStart,
    ),
    index("rate_limit_window_window_idx").on(t.windowStart),
  ],
);
