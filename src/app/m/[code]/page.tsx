import { TRPCError } from "@trpc/server";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { env } from "@/data/env/server";
import { getCurrentUser } from "@/features/core/auth/nextjs/currentUser";
import { MeetingClient } from "@/features/meetings/components/meeting-client";
import { normalizeMeetingCode } from "@/features/meetings/lib/meeting-code";
import {
  RETURN_COOKIE_NAME,
  readReturnTarget,
} from "@/integrations/sso/cookie";
import { api } from "@/integrations/trpc/server";

type MeetingPageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ invite?: string; name?: string }>;
};

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

export default async function MeetingPage({
  params,
  searchParams,
}: MeetingPageProps) {
  const [{ code }, { invite, name }] = await Promise.all([
    params,
    searchParams,
  ]);
  const [meeting, user, cookieStore] = await Promise.all([
    loadMeeting(code),
    getCurrentUser(),
    cookies(),
  ]);
  // Set by /sso/join when the sending system asked for the person back.
  const returnTarget = env.JWT_SECRET_KEY
    ? await readReturnTarget(
        env.JWT_SECRET_KEY,
        cookieStore.get(RETURN_COOKIE_NAME)?.value,
        meeting.code,
      )
    : null;

  return (
    <MeetingClient
      meeting={meeting}
      viewer={{
        defaultName: user?.name ?? "",
        isSignedIn: user != null,
        // `?name=` comes from a participant SSO link: the sending system
        // already knows who this is, so the field is filled in for them.
        presetName: typeof name === "string" ? name.slice(0, 64) : null,
      }}
      inviteToken={typeof invite === "string" ? invite : null}
      returnTarget={
        returnTarget ? { url: returnTarget.url, name: returnTarget.name } : null
      }
    />
  );
}
