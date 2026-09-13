CREATE TABLE "billing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paddleEventId" varchar(64) NOT NULL,
	"eventType" varchar(64) NOT NULL,
	"occurredAt" timestamp with time zone NOT NULL,
	"organizationId" uuid,
	"payload" jsonb NOT NULL,
	"receivedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"processedAt" timestamp with time zone,
	"outcome" varchar(32),
	"error" text
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "paddleCustomerId" varchar(64);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "paddleSubscriptionId" varchar(64);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "paddleSubscriptionStatus" varchar(32);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "paddlePriceId" varchar(64);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "currentPeriodEndsAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "paddleSyncedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_events_paddle_event_unique" ON "billing_events" USING btree ("paddleEventId");--> statement-breakpoint
CREATE INDEX "billing_events_org_idx" ON "billing_events" USING btree ("organizationId","occurredAt");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_paddle_subscription_unique" ON "organizations" USING btree ("paddleSubscriptionId");--> statement-breakpoint
CREATE INDEX "organizations_paddle_customer_idx" ON "organizations" USING btree ("paddleCustomerId");