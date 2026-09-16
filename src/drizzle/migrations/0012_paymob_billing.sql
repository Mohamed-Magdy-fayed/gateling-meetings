CREATE TABLE "billing_checkouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(16) DEFAULT 'paymob' NOT NULL,
	"organizationId" uuid NOT NULL,
	"createdByUserId" uuid,
	"kind" varchar(16) DEFAULT 'subscribe' NOT NULL,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"plan" "plan" NOT NULL,
	"interval" varchar(8) NOT NULL,
	"seats" integer DEFAULT 1 NOT NULL,
	"amountCents" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"reference" varchar(64) NOT NULL,
	"providerIntentionId" varchar(128),
	"providerOrderId" varchar(64),
	"providerSubscriptionId" varchar(64),
	"providerTransactionId" varchar(64),
	"completedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "billing_customers" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"provider" varchar(16) DEFAULT 'paymob' NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" varchar(256),
	"status" varchar(16) NOT NULL,
	"organizationId" uuid,
	"cardToken" varchar(128),
	"maskedPan" varchar(32),
	"cardBrand" varchar(32),
	"syncedAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "billing_subscriptions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"provider" varchar(16) DEFAULT 'paymob' NOT NULL,
	"customerId" varchar(64),
	"organizationId" uuid,
	"status" varchar(32) NOT NULL,
	"rawStatus" varchar(32),
	"planId" varchar(64),
	"quantity" integer DEFAULT 1 NOT NULL,
	"amountCents" integer,
	"currency" varchar(3),
	"currentPeriodStartsAt" timestamp with time zone,
	"currentPeriodEndsAt" timestamp with time zone,
	"scheduledChangeAction" varchar(32),
	"scheduledChangeAt" timestamp with time zone,
	"canceledAt" timestamp with time zone,
	"pausedAt" timestamp with time zone,
	"syncedAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "billing_events" ADD COLUMN "provider" varchar(16) DEFAULT 'paymob' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_events" ADD COLUMN "providerEventId" varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "billingCustomerId" varchar(64);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "billingSubscriptionId" varchar(64);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "billingSubscriptionStatus" varchar(32);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "billingPlanId" varchar(64);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "currentPeriodEndsAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "billingSyncedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "billingName" varchar(128);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "billingPhone" varchar(32);--> statement-breakpoint
ALTER TABLE "billing_checkouts" ADD CONSTRAINT "billing_checkouts_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_checkouts" ADD CONSTRAINT "billing_checkouts_createdByUserId_users_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_checkouts_reference_unique" ON "billing_checkouts" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_checkouts_provider_order_unique" ON "billing_checkouts" USING btree ("provider","providerOrderId");--> statement-breakpoint
CREATE INDEX "billing_checkouts_org_idx" ON "billing_checkouts" USING btree ("organizationId","createdAt");--> statement-breakpoint
CREATE INDEX "billing_customers_email_idx" ON "billing_customers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "billing_customers_org_idx" ON "billing_customers" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "billing_subscriptions_customer_idx" ON "billing_subscriptions" USING btree ("customerId");--> statement-breakpoint
CREATE INDEX "billing_subscriptions_org_idx" ON "billing_subscriptions" USING btree ("organizationId");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_events_provider_event_unique" ON "billing_events" USING btree ("provider","providerEventId");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_billing_subscription_unique" ON "organizations" USING btree ("billingSubscriptionId");--> statement-breakpoint
CREATE INDEX "organizations_billing_customer_idx" ON "organizations" USING btree ("billingCustomerId");