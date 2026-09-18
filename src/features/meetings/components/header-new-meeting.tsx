"use client";

import { usePathname } from "next/navigation";

import { NewMeetingButton } from "./new-meeting-button";

/**
 * The header's "New meeting" — everywhere except the dashboard, whose own
 * action row already leads with it, and inside a room, which has no header.
 */
export function HeaderNewMeeting() {
  const pathname = usePathname();
  if (pathname === "/dashboard") return null;
  return (
    <NewMeetingButton size="default" className="ms-1 hidden sm:inline-flex" />
  );
}
