CREATE TYPE "public"."oauth_provider" AS ENUM('google');--> statement-breakpoint
CREATE TYPE "public"."user_token_type" AS ENUM('email_verification', 'password_reset', 'device_trust', 'otp', 'magic_link', 'org_invite');--> statement-breakpoint
CREATE TYPE "public"."meeting_status" AS ENUM('scheduled', 'live', 'ended');--> statement-breakpoint
CREATE TABLE "biometric_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"credentialId" text NOT NULL,
	"publicKey" text NOT NULL,
	"label" text,
	"transports" jsonb,
	"signCount" bigint DEFAULT 0 NOT NULL,
	"aaguid" text,
	"isBackupEligible" boolean DEFAULT false NOT NULL,
	"isBackupState" boolean DEFAULT false NOT NULL,
	"isUserVerified" boolean DEFAULT false NOT NULL,
	"lastUsedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_credentials" (
	"userId" uuid NOT NULL,
	"passwordHash" text NOT NULL,
	"passwordSalt" text NOT NULL,
	"expiresAt" timestamp with time zone,
	"mustChangePassword" boolean DEFAULT false NOT NULL,
	"lastChangedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_oauth_accounts" (
	"userId" uuid NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now(),
	"provider" "oauth_provider" NOT NULL,
	"providerAccountId" text NOT NULL,
	"displayName" text,
	"profileUrl" text,
	CONSTRAINT "user_oauth_accounts_providerAccountId_provider_pk" PRIMARY KEY("providerAccountId","provider")
);
--> statement-breakpoint
CREATE TABLE "user_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"tokenHash" text NOT NULL,
	"type" "user_token_type" NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"consumedAt" timestamp with time zone,
	"metadata" jsonb DEFAULT 'null'::jsonb,
	CONSTRAINT "user_tokens_tokenHash_unique" UNIQUE("tokenHash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(256) NOT NULL,
	"name" varchar(256),
	"phone" varchar(16),
	"imageUrl" varchar(512),
	"emailVerifiedAt" timestamp with time zone,
	"lastSignInAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdBy" varchar NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now(),
	"updatedBy" varchar,
	"deletedAt" timestamp with time zone,
	"deletedBy" varchar
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hostId" uuid NOT NULL,
	"code" varchar(12) NOT NULL,
	"title" varchar(200) NOT NULL,
	"passcodeHash" varchar(256),
	"passcodeSalt" varchar(64),
	"isPersonalRoom" boolean DEFAULT false NOT NULL,
	"scheduledAt" timestamp with time zone,
	"durationMinutes" integer,
	"timezone" varchar(64),
	"status" "meeting_status" DEFAULT 'scheduled' NOT NULL,
	"startedAt" timestamp with time zone,
	"endedAt" timestamp with time zone,
	"settings" jsonb DEFAULT '{"waitingRoom":true,"muteOnEntry":false,"allowGuests":true,"allowScreenShare":true,"locked":false}'::jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdBy" varchar NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now(),
	"updatedBy" varchar,
	"deletedAt" timestamp with time zone,
	"deletedBy" varchar
);
--> statement-breakpoint
ALTER TABLE "biometric_credentials" ADD CONSTRAINT "biometric_credentials_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_oauth_accounts" ADD CONSTRAINT "user_oauth_accounts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tokens" ADD CONSTRAINT "user_tokens_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_hostId_users_id_fk" FOREIGN KEY ("hostId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_credentials_user_id_unique" ON "user_credentials" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "user_oauth_accounts_user_provider_unique" ON "user_oauth_accounts" USING btree ("userId","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_unique" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "meetings_code_unique" ON "meetings" USING btree ("code");--> statement-breakpoint
CREATE INDEX "meetings_host_idx" ON "meetings" USING btree ("hostId");--> statement-breakpoint
CREATE INDEX "meetings_scheduled_at_idx" ON "meetings" USING btree ("scheduledAt");