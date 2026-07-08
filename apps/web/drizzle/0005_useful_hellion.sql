CREATE TABLE "focat_order" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"chain_id" text NOT NULL,
	"wallet_address" text NOT NULL,
	"pack" text NOT NULL,
	"focat_amount" integer NOT NULL,
	"price_micro_usdc" bigint NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"tx_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "focat_order" ADD CONSTRAINT "focat_order_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "focat_order_user_created_idx" ON "focat_order" USING btree ("user_id","created_at");