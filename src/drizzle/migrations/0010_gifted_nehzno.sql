CREATE TABLE "paddle_customers" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" varchar(256),
	"status" varchar(16) NOT NULL,
	"organizationId" uuid,
	"syncedAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "paddle_subscriptions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"customerId" varchar(64) NOT NULL,
	"organizationId" uuid,
	"status" varchar(32) NOT NULL,
	"priceId" varchar(64),
	"productId" varchar(64),
	"quantity" integer DEFAULT 1 NOT NULL,
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
ALTER TABLE "paddle_customers" ADD CONSTRAINT "paddle_customers_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paddle_subscriptions" ADD CONSTRAINT "paddle_subscriptions_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "paddle_customers_email_idx" ON "paddle_customers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "paddle_customers_org_idx" ON "paddle_customers" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "paddle_subscriptions_customer_idx" ON "paddle_subscriptions" USING btree ("customerId");--> statement-breakpoint
CREATE INDEX "paddle_subscriptions_org_idx" ON "paddle_subscriptions" USING btree ("organizationId");