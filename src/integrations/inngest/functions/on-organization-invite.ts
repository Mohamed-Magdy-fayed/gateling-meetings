import { eq } from "drizzle-orm";

import { db } from "@/drizzle";
import {
  OrganizationsTable,
  UsersTable,
  UserTokensTable,
} from "@/drizzle/schema";
import { sendOrganizationInviteEmail } from "@/features/organizations/server/emails";
import { parseInviteMetadata } from "@/features/organizations/server/invites";
import { inngest } from "../client";
import { organizationInviteRequestedEvent } from "./meeting-events";

export const onOrganizationInvite = inngest.createFunction(
  {
    id: "on-organization-invite",
    triggers: [organizationInviteRequestedEvent],
  },
  async ({ event, step }) => {
    return step.run("send-invite", async () => {
      const row = await db.query.UserTokensTable.findFirst({
        where: eq(UserTokensTable.id, event.data.tokenId),
      });
      // Revoked or replaced before the email went out: nothing to send.
      if (!row || row.consumedAt) return "gone";
      const metadata = parseInviteMetadata(row.metadata);
      if (!metadata) return "malformed";
      const [organization, inviter] = await Promise.all([
        db.query.OrganizationsTable.findFirst({
          where: eq(OrganizationsTable.id, metadata.organizationId),
          columns: { name: true },
        }),
        db.query.UsersTable.findFirst({
          where: eq(UsersTable.id, metadata.invitedBy),
          columns: { name: true, email: true },
        }),
      ]);
      if (!organization || !inviter) return "gone";
      await sendOrganizationInviteEmail({
        to: metadata.email,
        organizationName: organization.name,
        inviterName: inviter.name ?? inviter.email,
        token: event.data.token,
        locale: event.data.locale,
      });
      return "sent";
    });
  },
);
