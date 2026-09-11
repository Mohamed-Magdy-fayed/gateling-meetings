CREATE TABLE "meeting_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meetingId" uuid NOT NULL,
	"email" varchar(256) NOT NULL,
	"name" varchar(128),
	"token" varchar(64) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"sentAt" timestamp with time zone,
	"remindedAt" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "meeting_invites" ADD CONSTRAINT "meeting_invites_meetingId_meetings_id_fk" FOREIGN KEY ("meetingId") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_invites_token_unique" ON "meeting_invites" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_invites_meeting_email_unique" ON "meeting_invites" USING btree ("meetingId","email");--> statement-breakpoint
CREATE INDEX "meeting_invites_meeting_idx" ON "meeting_invites" USING btree ("meetingId");