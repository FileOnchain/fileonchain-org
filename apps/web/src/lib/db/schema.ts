import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";
import type { ChainFamily, ChainId } from "@fileonchain/sdk";

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

/** API keys — only the SHA-256 hash is stored; plaintext is shown once. */
export const apiKeys = pgTable("api_key", {
  id: text("id").primaryKey().$defaultFn(uuid),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** Display prefix, e.g. `fok_a1b2c3d4` — enough to recognize, not to use. */
  prefix: text("prefix").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
  | "byok_removed";

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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("upload_job_user_created_idx").on(t.userId, t.createdAt)],
);
