CREATE TABLE "billing_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(16) DEFAULT 'paymob' NOT NULL,
	"providerTransactionId" varchar(64) NOT NULL,
	"kind" varchar(16) NOT NULL,
	"status" varchar(16) NOT NULL,
	"parentTransactionId" varchar(64),
	"organizationId" uuid,
	"checkoutId" uuid,
	"billingEventId" uuid,
	"providerOrderId" varchar(64),
	"providerSubscriptionId" varchar(64),
	"amountCents" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"plan" varchar(16),
	"interval" varchar(8),
	"seats" integer,
	"cardBrand" varchar(32),
	"cardLast4" varchar(4),
	"customerEmail" varchar(256),
	"refundedAmountCents" integer DEFAULT 0 NOT NULL,
	"voidedAt" timestamp with time zone,
	"occurredAt" timestamp with time zone NOT NULL,
	"receiptSentAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD CONSTRAINT "billing_transactions_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD CONSTRAINT "billing_transactions_checkoutId_billing_checkouts_id_fk" FOREIGN KEY ("checkoutId") REFERENCES "public"."billing_checkouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD CONSTRAINT "billing_transactions_billingEventId_billing_events_id_fk" FOREIGN KEY ("billingEventId") REFERENCES "public"."billing_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_transactions_provider_txn_unique" ON "billing_transactions" USING btree ("provider","providerTransactionId");--> statement-breakpoint
CREATE INDEX "billing_transactions_org_idx" ON "billing_transactions" USING btree ("organizationId","occurredAt");--> statement-breakpoint
CREATE INDEX "billing_transactions_occurred_idx" ON "billing_transactions" USING btree ("occurredAt");