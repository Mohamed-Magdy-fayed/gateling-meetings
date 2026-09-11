import { TRPCError } from "@trpc/server";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/features/core/auth/nextjs/currentUser";
import { MeetingClient } from "@/features/meetings/components/meeting-client";
import { normalizeMeetingCode } from "@/features/meetings/lib/meeting-code";
import { api } from "@/integrations/trpc/server";

type MeetingPageProps = { params: Promise<{ code: string }> };

async function loadMeeting(rawCode: string) {
  const code = normalizeMeetingCode(rawCode);
  if (!code) notFound();
  // `/m/ABCDEFGHIJ` and friends resolve to the canonical URL so the link a
  // person shares is always the same one.
  if (code !== rawCode) redirect(`/m/${code}`);

  const caller = await api();
  try {
    return await caller.meetings.getByCode({ code });
  } catch (error) {
    if (error instanceof TRPCError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}

export async function generateMetadata({
  params,
}: MeetingPageProps): Promise<Metadata> {
  const { code } = await params;
  const meeting = await loadMeeting(code);
  return { title: meeting.title, robots: { index: false } };
}

export default async function MeetingPage({ params }: MeetingPageProps) {
  const { code } = await params;
  const [meeting, user] = await Promise.all([
    loadMeeting(code),
    getCurrentUser(),
  ]);

  return (
    <MeetingClient
      meeting={meeting}
      viewer={{
        defaultName: user?.name ?? "",
        isSignedIn: user != null,
      }}
    />
  );
}
