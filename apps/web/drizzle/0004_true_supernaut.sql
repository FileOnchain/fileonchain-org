ALTER TABLE "upload_job" ADD COLUMN "platform_id" text;--> statement-breakpoint
ALTER TABLE "upload_job" ADD COLUMN "tip_base_units" bigint;--> statement-breakpoint
ALTER TABLE "upload_job" ADD COLUMN "verification_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "upload_job" ADD COLUMN "challenge_deadline_at" timestamp with time zone;