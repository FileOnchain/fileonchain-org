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
 *  `/api/v1/retention`). The `scope` column is denormalized from
 *  `orgId IS NOT NULL` so we can index / filter on it without the IS NOT
 *  NULL dance. */
export type ApiKeyScope = "personal" | "org";

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
    /** Denormalized `personal` | `org`. Defaults to `personal`. */
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

/** USDC deposit intents. Confirmation is mocked for now. */
export const deposits = pgTable("deposit", {
  id: text("id").primaryKey().$defaultFn(uuid),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  chainId: text("chain_id").$type<ChainId>().notNull(),
  amountMicroUsdc: bigint("amount_micro_usdc", { mode: "bigint" }).notNull(),
  /** Mock deposit address shown to the user. */
  depositAddress: text("deposit_address").notNull(),
  status: text("status").$type<DepositStatus>().notNull().default("pending"),
  txHash: text("tx_hash"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
  | "cloud_signer_revoked";

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
 * Per-org Cloud signing key used for server-side envelope sealing
 * (`server_sign`). The Cloud adds an ENVELOPE signature — a `service`
 * signer identity attesting it assembled/exported the envelope — never an
 * artifact signature (which would claim authorship of the subject). The
 * ed25519 seed is sealed at rest with `lib/crypto/secretbox.ts` (same
 * `iv.ciphertext.tag` base64 format as `byok_key`). The public key is
 * exposed unauthenticated at `/api/cloud/signer/[orgId]` so verifiers can
 * resolve `keyStatusUrl`. Rotation revokes the current row (sets
 * `revoked_at`) and inserts a new one; a partial unique index enforces at
 * most one active (`revoked_at IS NULL`) signer per org.
 */
export const cloudSigners = pgTable(
  "cloud_signer",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
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
    uniqueIndex("cloud_signer_one_active_per_org")
      .on(t.orgId)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);
