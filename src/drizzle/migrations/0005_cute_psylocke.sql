CREATE TYPE "public"."organization_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('free', 'pro', 'business');--> statement-breakpoint
CREATE TYPE "public"."plan_source" AS ENUM('free', 'subscription', 'manual', 'trial');--> statement-breakpoint
CREATE TABLE "organization_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"userId" uuid NOT NULL,
	"role" "organization_role" DEFAULT 'member' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdBy" varchar NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now(),
	"updatedBy" varchar
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(128) NOT NULL,
	"personalOwnerId" uuid,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"planSource" "plan_source" DEFAULT 'free' NOT NULL,
	"planExpiresAt" timestamp with time zone,
	"planNote" text,
	"seatLimit" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdBy" varchar NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now(),
	"updatedBy" varchar,
	"deletedAt" timestamp with time zone,
	"deletedBy" varchar
);
--> statement-breakpoint
CREATE TABLE "plan_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(256) NOT NULL,
	"plan" "plan" NOT NULL,
	"seatLimit" integer DEFAULT 1 NOT NULL,
	"expiresAt" timestamp with time zone,
	"note" text,
	"grantedBy" varchar(256) NOT NULL,
	"consumedAt" timestamp with time zone,
	"consumedByOrganizationId" uuid,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now(),
	"updatedBy" varchar
);
--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "organizationId" uuid;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_personalOwnerId_users_id_fk" FOREIGN KEY ("personalOwnerId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_grants" ADD CONSTRAINT "plan_grants_consumedByOrganizationId_organizations_id_fk" FOREIGN KEY ("consumedByOrganizationId") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_memberships_org_user_unique" ON "organization_memberships" USING btree ("organizationId","userId");--> statement-breakpoint
CREATE INDEX "organization_memberships_user_idx" ON "organization_memberships" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_personal_owner_unique" ON "organizations" USING btree ("personalOwnerId");--> statement-breakpoint
CREATE INDEX "plan_grants_email_idx" ON "plan_grants" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_grants_email_pending_unique" ON "plan_grants" USING btree ("email") WHERE "consumedAt" IS NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meetings_organization_status_idx" ON "meetings" USING btree ("organizationId","status");