CREATE TABLE "agent_run" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"run_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"envelope_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_envelope" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"api_key_id" text,
	"profile" text,
	"subject_sha256" text,
	"subject_kind" text,
	"envelope" jsonb NOT NULL,
	"envelope_digest" text NOT NULL,
	"claim_summary" jsonb DEFAULT '{"keys":[],"namespaces":[],"signers":[]}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"verification_count" integer DEFAULT 0 NOT NULL,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retention_policy" (
	"org_id" text PRIMARY KEY NOT NULL,
	"window_days" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN "org_id" text;--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN "scope" text DEFAULT 'personal' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_envelope_id_evidence_envelope_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."evidence_envelope"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_envelope" ADD CONSTRAINT "evidence_envelope_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_envelope" ADD CONSTRAINT "evidence_envelope_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_envelope" ADD CONSTRAINT "evidence_envelope_api_key_id_api_key_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_key"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_policy" ADD CONSTRAINT "retention_policy_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_run_org_created_idx" ON "agent_run" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_run_run_idx" ON "agent_run" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_run_org_run_envelope_unique" ON "agent_run" USING btree ("org_id","run_id","envelope_id");--> statement-breakpoint
CREATE INDEX "evidence_envelope_org_created_idx" ON "evidence_envelope" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "evidence_envelope_subject_idx" ON "evidence_envelope" USING btree ("subject_sha256");--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_key_user_created_idx" ON "api_key" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "api_key_org_idx" ON "api_key" USING btree ("org_id");--> statement-breakpoint

-- Cloud evidence search index — Drizzle-ORM cannot express
-- `GENERATED ALWAYS AS … STORED` columns, so the tsvector is added by hand.
-- The expression lives in apps/web/src/lib/db/migrations-helpers.ts so any
-- later update is a single source of truth.
ALTER TABLE "evidence_envelope" ADD COLUMN "search_tsv" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(subject_sha256, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(profile, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce((claim_summary ->> 'signers'), '')), 'B') ||
    setweight(to_tsvector('simple', coalesce((claim_summary ->> 'keys'), '')), 'C')
  ) STORED;--> statement-breakpoint
CREATE INDEX "evidence_envelope_search_idx" ON "evidence_envelope" USING gin ("search_tsv");