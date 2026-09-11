CREATE TYPE "public"."breakout_status" AS ENUM('draft', 'open', 'closed');--> statement-breakpoint
CREATE TABLE "breakout_assignments" (
	"breakoutRoomId" uuid NOT NULL,
	"identity" varchar(64) NOT NULL,
	"displayName" varchar(64) NOT NULL,
	"assignedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "breakout_assignments_breakoutRoomId_identity_pk" PRIMARY KEY("breakoutRoomId","identity")
);
--> statement-breakpoint
CREATE TABLE "breakout_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meetingId" uuid NOT NULL,
	"index" integer NOT NULL,
	"name" varchar(64) NOT NULL,
	"liveKitRoomName" varchar(32) NOT NULL,
	"status" "breakout_status" DEFAULT 'draft' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"openedAt" timestamp with time zone,
	"closedAt" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "breakout_assignments" ADD CONSTRAINT "breakout_assignments_breakoutRoomId_breakout_rooms_id_fk" FOREIGN KEY ("breakoutRoomId") REFERENCES "public"."breakout_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breakout_rooms" ADD CONSTRAINT "breakout_rooms_meetingId_meetings_id_fk" FOREIGN KEY ("meetingId") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "breakout_rooms_livekit_name_unique" ON "breakout_rooms" USING btree ("liveKitRoomName");--> statement-breakpoint
CREATE INDEX "breakout_rooms_meeting_idx" ON "breakout_rooms" USING btree ("meetingId");