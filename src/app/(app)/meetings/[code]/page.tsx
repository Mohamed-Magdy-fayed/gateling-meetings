import { TRPCError } from "@trpc/server";
import { notFound } from "next/navigation";

import { getCurrentUser } from "@/features/core/auth/nextjs/currentUser";
import { MeetingDetail } from "@/features/meetings/components/meeting-detail";
import { normalizeMeetingCode } from "@/features/meetings/lib/meeting-code";
import { api } from "@/integrations/trpc/server";

type Props = { params: Promise<{ code: string }> };

export default async function MeetingDetailPage({ params }: Props) {
  await getCurrentUser({ redirectIfNotFound: true });
  const { code: raw } = await params;
  const code = normalizeMeetingCode(raw);
  if (!code) notFound();

  const caller = await api();
  try {
    const meeting = await caller.meetings.getForHost({ code });
    return <MeetingDetail meeting={meeting} />;
  } catch (error) {
    if (
      error instanceof TRPCError &&
      (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")
    ) {
      notFound();
    }
    throw error;
  }
}
