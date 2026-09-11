CREATE TYPE "public"."join_request_status" AS ENUM('pending', 'admitted', 'denied');--> statement-breakpoint
CREATE TABLE "join_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meetingId" uuid NOT NULL,
	"identity" varchar(64) NOT NULL,
	"displayName" varchar(64) NOT NULL,
	"userId" uuid,
	"status" "join_request_status" DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSeenAt" timestamp with time zone DEFAULT now() NOT NULL,
	"resolvedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "meeting_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meetingId" uuid NOT NULL,
	"identity" varchar(64) NOT NULL,
	"displayName" varchar(64) NOT NULL,
	"userId" uuid,
	"role" varchar(16) NOT NULL,
	"joinedAt" timestamp with time zone NOT NULL,
	"leftAt" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_meetingId_meetings_id_fk" FOREIGN KEY ("meetingId") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meetingId_meetings_id_fk" FOREIGN KEY ("meetingId") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "join_requests_meeting_status_idx" ON "join_requests" USING btree ("meetingId","status");--> statement-breakpoint
CREATE INDEX "meeting_participants_meeting_idx" ON "meeting_participants" USING btree ("meetingId");--> statement-breakpoint
CREATE INDEX "meeting_participants_identity_idx" ON "meeting_participants" USING btree ("meetingId","identity");