CREATE TABLE "compliance_report" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"generated_by_user_id" text,
	"envelope" jsonb NOT NULL,
	"envelope_digest" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "export_job" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"project_id" text,
	"requested_by_user_id" text NOT NULL,
	"filter" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"format" text DEFAULT 'zip' NOT NULL,
	"include_agent_run_index" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"envelope_count" integer DEFAULT 0 NOT NULL,
	"byte_size" bigint DEFAULT 0 NOT NULL,
	"file_path" text,
	"download_token" text,
	"expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_sla" (
	"org_id" text PRIMARY KEY NOT NULL,
	"tier" text DEFAULT 'free' NOT NULL,
	"monthly_envelopes_limit" integer,
	"monthly_anchors_limit" integer,
	"monthly_uptime_pct" integer DEFAULT 9900 NOT NULL,
	"settlement_latency_p95_ms" integer DEFAULT 60000 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_member" (
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'contributor' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_member_project_id_user_id_pk" PRIMARY KEY("project_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"retention_days" integer,
	"envelopes_per_month" integer,
	"anchors_per_month" integer,
	"bytes_anchored_per_month" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"endpoint_id" text NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"delivered_at" timestamp with time zone,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoint" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"url" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"encrypted_secret" text NOT NULL,
	"secret_preview" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "webhook_subscription" (
	"endpoint_id" text NOT NULL,
	"event_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_subscription_endpoint_id_event_type_pk" PRIMARY KEY("endpoint_id","event_type")
);
--> statement-breakpoint
DROP INDEX "cloud_signer_one_active_per_org";--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "cloud_signer" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "evidence_envelope" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "upload_job" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "compliance_report" ADD CONSTRAINT "compliance_report_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_report" ADD CONSTRAINT "compliance_report_generated_by_user_id_user_id_fk" FOREIGN KEY ("generated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_job" ADD CONSTRAINT "export_job_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_job" ADD CONSTRAINT "export_job_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_sla" ADD CONSTRAINT "org_sla_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_endpoint_id_webhook_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoint"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_subscription" ADD CONSTRAINT "webhook_subscription_endpoint_id_webhook_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoint"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compliance_report_org_generated_idx" ON "compliance_report" USING btree ("org_id","generated_at");--> statement-breakpoint
CREATE INDEX "compliance_report_org_period_idx" ON "compliance_report" USING btree ("org_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "export_job_org_created_idx" ON "export_job" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "export_job_expires_idx" ON "export_job" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "project_member_user_idx" ON "project_member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_org_slug_unique" ON "project" USING btree ("org_id","slug");--> statement-breakpoint
CREATE INDEX "project_org_idx" ON "project" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_delivery_endpoint_event_unique" ON "webhook_delivery" USING btree ("endpoint_id","event_id");--> statement-breakpoint
CREATE INDEX "webhook_delivery_due_idx" ON "webhook_delivery" USING btree ("next_attempt_at") WHERE "webhook_delivery"."delivered_at" IS NULL;--> statement-breakpoint
CREATE INDEX "webhook_endpoint_org_idx" ON "webhook_endpoint" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "api_key_project_idx" ON "api_key" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "cloud_signer_project_idx" ON "cloud_signer" USING btree ("project_id");--> statement-breakpoint
/* Hand-appended: FKs for project_id columns that were declared in the
 * schema without an inline .references() so the project table could be
 * declared after the dependents. Cascade rules:
 *   - api_key: cascade (deleting a project removes its scoped keys)
 *   - cloud_signer: cascade (deleting a project removes its signer row)
 *   - evidence_envelope: set null (audit trail survives project removal;
 *     the row's project_id nulls out, the envelope stays put)
 *   - upload_job: set null (same audit-trail reasoning)
 *   - export_job: cascade (deleting a project removes its export jobs) */
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_signer" ADD CONSTRAINT "cloud_signer_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_envelope" ADD CONSTRAINT "evidence_envelope_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_job" ADD CONSTRAINT "upload_job_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_job" ADD CONSTRAINT "export_job_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
/* Hand-appended: partial-unique indexes for cloud_signer. The original
 * `cloud_signer_one_active_per_org` index (one active per org) was
 * dropped at the top of this migration; we replace it with two:
 *   - one active per org (when project_id IS NULL)
 *   - one active per project (when project_id IS NOT NULL).            */
CREATE UNIQUE INDEX "cloud_signer_one_active_per_org" ON "cloud_signer" USING btree ("org_id") WHERE "project_id" IS NULL AND "revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_signer_one_active_per_project" ON "cloud_signer" USING btree ("project_id") WHERE "project_id" IS NOT NULL AND "revoked_at" IS NULL;--> statement-breakpoint
/* Hand-appended: DB-level enum guards. The TS layer already enforces
 * these via the typed string unions — the CHECKs are belt-and-braces so
 * a future raw write (admin script, etc.) cannot insert an unknown
 * value. */
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_scope_check" CHECK ("scope" IN ('personal','org','project'));--> statement-breakpoint
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_role_check" CHECK ("role" IN ('lead','contributor'));--> statement-breakpoint
ALTER TABLE "org_sla" ADD CONSTRAINT "org_sla_tier_check" CHECK ("tier" IN ('free','team','enterprise'));--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_url_check" CHECK ("url" LIKE 'http://%' OR "url" LIKE 'https://%');--> statement-breakpoint
ALTER TABLE "webhook_subscription" ADD CONSTRAINT "webhook_subscription_event_type_check" CHECK ("event_type" IN ('evidence.sealed','evidence.verified','evidence.expired','agent_run.sealed','anchor.job.settled','signer.rotated','signer.revoked','compliance_report.generated'));--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_event_type_check" CHECK ("event_type" IN ('evidence.sealed','evidence.verified','evidence.expired','agent_run.sealed','anchor.job.settled','signer.rotated','signer.revoked','compliance_report.generated'));--> statement-breakpoint
CREATE INDEX "evidence_envelope_project_idx" ON "evidence_envelope" USING btree ("project_id");