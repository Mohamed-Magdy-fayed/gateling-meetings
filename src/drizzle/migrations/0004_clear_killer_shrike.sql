CREATE TYPE "public"."webhook_delivery_status" AS ENUM('pending', 'delivered', 'failed');--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(128) NOT NULL,
	"slug" varchar(64) NOT NULL,
	"apiKeyPrefix" varchar(16) NOT NULL,
	"apiKeyHash" varchar(64) NOT NULL,
	"webhookUrl" varchar(2048),
	"webhookSecret" varchar(128),
	"allowedReturnOrigins" text[] DEFAULT '{}' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdBy" varchar NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now(),
	"updatedBy" varchar,
	"revokedAt" timestamp with time zone,
	"lastUsedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "linked_users" (
	"integrationId" uuid NOT NULL,
	"externalId" varchar(128) NOT NULL,
	"userId" uuid NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSeenAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "linked_users_integrationId_externalId_pk" PRIMARY KEY("integrationId","externalId")
);
--> statement-breakpoint
CREATE TABLE "sso_tokens" (
	"jti" varchar(64) PRIMARY KEY NOT NULL,
	"integrationId" uuid NOT NULL,
	"meetingId" uuid NOT NULL,
	"role" varchar(16) NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"usedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integrationId" uuid NOT NULL,
	"event" varchar(64) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "webhook_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lastError" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"deliveredAt" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "integrationId" uuid;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "externalRef" varchar(128);--> statement-breakpoint
ALTER TABLE "linked_users" ADD CONSTRAINT "linked_users_integrationId_integrations_id_fk" FOREIGN KEY ("integrationId") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linked_users" ADD CONSTRAINT "linked_users_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_tokens" ADD CONSTRAINT "sso_tokens_integrationId_integrations_id_fk" FOREIGN KEY ("integrationId") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_tokens" ADD CONSTRAINT "sso_tokens_meetingId_meetings_id_fk" FOREIGN KEY ("meetingId") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_integrationId_integrations_id_fk" FOREIGN KEY ("integrationId") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_slug_unique" ON "integrations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "integrations_api_key_prefix_idx" ON "integrations" USING btree ("apiKeyPrefix");--> statement-breakpoint
CREATE UNIQUE INDEX "linked_users_integration_user_unique" ON "linked_users" USING btree ("integrationId","userId");--> statement-breakpoint
CREATE INDEX "sso_tokens_meeting_idx" ON "sso_tokens" USING btree ("meetingId");--> statement-breakpoint
CREATE INDEX "sso_tokens_expires_at_idx" ON "sso_tokens" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_integration_idx" ON "webhook_deliveries" USING btree ("integrationId","createdAt");--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_integrationId_integrations_id_fk" FOREIGN KEY ("integrationId") REFERENCES "public"."integrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meetings_integration_external_ref_idx" ON "meetings" USING btree ("integrationId","externalRef");