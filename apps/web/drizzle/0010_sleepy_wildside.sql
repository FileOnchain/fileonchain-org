CREATE TABLE "deposit_cursor" (
	"chain_id" text PRIMARY KEY NOT NULL,
	"last_scanned_block" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indexed_anchor_event" (
	"id" text PRIMARY KEY NOT NULL,
	"chain_id" text NOT NULL,
	"cid" text NOT NULL,
	"registry_address" text NOT NULL,
	"tx_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	"block_number" bigint NOT NULL,
	"block_timestamp" timestamp with time zone NOT NULL,
	"submitter" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'anchored' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indexer_cursor" (
	"chain_id" text PRIMARY KEY NOT NULL,
	"last_scanned_block" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_window" (
	"id" text PRIMARY KEY NOT NULL,
	"scope_kind" text NOT NULL,
	"scope_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "indexed_anchor_event_chain_tx_log_unique" ON "indexed_anchor_event" USING btree ("chain_id","tx_hash","log_index");--> statement-breakpoint
CREATE INDEX "indexed_anchor_event_cid_idx" ON "indexed_anchor_event" USING btree ("cid","block_timestamp");--> statement-breakpoint
CREATE INDEX "indexed_anchor_event_submitter_idx" ON "indexed_anchor_event" USING btree ("submitter","block_timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limit_window_scope_endpoint_window_unique" ON "rate_limit_window" USING btree ("scope_kind","scope_id","endpoint","window_start");--> statement-breakpoint
CREATE INDEX "rate_limit_window_window_idx" ON "rate_limit_window" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "deposit_user_status_idx" ON "deposit" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "deposit_tx_hash_unique" ON "deposit" USING btree ("tx_hash");--> statement-breakpoint
/* Hand-appended: DB-level enum guards matching the TS unions. Belt-and-braces
 * so a future raw write (admin script, manual psql) cannot insert an unknown
 * value. The activity_log.type CHECK is intentionally not added here — it
 * would need to cover every ActivityType entry, including values added by
 * future migrations; the TS union at the application layer is the source
 * of truth for that table. */
ALTER TABLE "indexed_anchor_event" ADD CONSTRAINT "indexed_anchor_event_status_check" CHECK ("status" IN ('anchored','pending','failed'));--> statement-breakpoint
ALTER TABLE "rate_limit_window" ADD CONSTRAINT "rate_limit_window_scope_kind_check" CHECK ("scope_kind" IN ('api_key','ip'));--> statement-breakpoint
ALTER TABLE "deposit" ADD CONSTRAINT "deposit_status_check" CHECK ("status" IN ('pending','confirmed','failed'));