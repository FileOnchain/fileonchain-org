CREATE TABLE "cloud_signer" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"scheme" text DEFAULT 'ed25519' NOT NULL,
	"public_key" text NOT NULL,
	"encrypted_secret" text NOT NULL,
	"key_preview" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "cloud_signer" ADD CONSTRAINT "cloud_signer_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cloud_signer_org_idx" ON "cloud_signer" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_signer_one_active_per_org" ON "cloud_signer" USING btree ("org_id") WHERE "cloud_signer"."revoked_at" IS NULL;