import "server-only";

import { type CallToolResult, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { meetingSettingsSchema } from "@/drizzle/schema";
import {
  meetingCodeSchema,
  meetingTitleSchema,
  passcodeSchema,
  scheduledMeetingSchema,
} from "@/features/meetings/server/schemas";
import { deleteMeeting, endMeeting } from "@/features/meetings/server/service";
import { toApiError } from "@/integrations/api/auth";
import { MAX_SSO_TTL_SECONDS } from "@/integrations/sso/token";
import {
  createIntegrationMeeting,
  type IntegrationActor,
  listIntegrationMeetings,
  listMeetingParticipants,
  requireIntegrationMeeting,
  toApiMeeting,
  updateIntegrationMeeting,
} from "./api-meetings";
import { externalRefSchema, externalUserSchema } from "./api-schemas";
import { DOC_SECTIONS, docTitle, readDoc } from "./docs";
import { createJoinLink } from "./join-links";

const SERVER_INFO = { name: "gateling-meetings", version: "1.0.0" };

/**
 * The MCP face of `/api/v1`: the same operations, the same service calls,
 * one tool each, so an agent holding an integration key can do what the
 * REST API can — plus read the docs. Built per request around the proven
 * integration; nothing here re-checks auth.
 */
export function buildMcpServer(actor: IntegrationActor): McpServer {
  const server = new McpServer(SERVER_INFO, {
    instructions:
      "Gateling Meetings for one integration. Meetings are identified by their code (xxx-xxxx-xxx). Times are ISO 8601 with an offset. Read `get_docs` for the REST and webhook contracts.",
  });
  const { db, t, integration } = actor;
  const actorId = `integration:${integration.slug}`;

  for (const section of DOC_SECTIONS) {
    server.registerResource(
      `docs-${section}`,
      `docs://${section}`,
      { title: docTitle(section), mimeType: "text/markdown" },
      async (uri) => ({
        contents: [{ uri: uri.href, text: await readDoc(section) }],
      }),
    );
  }

  server.registerTool(
    "get_docs",
    {
      title: "Read the developer docs",
      description:
        "The developer documentation as markdown: `integration` (REST API), `webhooks` (events and signatures) or `mcp` (this server).",
      inputSchema: z.object({ section: z.enum(DOC_SECTIONS) }),
      annotations: { readOnlyHint: true },
    },
    async ({ section }) => text(await readDoc(section)),
  );

  server.registerTool(
    "list_meetings",
    {
      title: "List meetings",
      description:
        "This integration's meetings, newest first. Filter by status or by the externalRef you gave at creation.",
      inputSchema: z.object({
        externalRef: externalRefSchema.optional(),
        status: z.enum(["scheduled", "live", "ended"]).optional(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
      annotations: { readOnlyHint: true },
    },
    (input) =>
      run(async () => {
        const meetings = await listIntegrationMeetings(
          db,
          integration.id,
          input,
        );
        return { meetings: meetings.map(toApiMeeting) };
      }),
  );

  server.registerTool(
    "get_meeting",
    {
      title: "Get a meeting",
      description: "One meeting by its code.",
      inputSchema: z.object({ code: meetingCodeSchema }),
      annotations: { readOnlyHint: true },
    },
    ({ code }) =>
      run(async () => ({
        meeting: toApiMeeting(
          await requireIntegrationMeeting(db, integration.id, code),
        ),
      })),
  );

  server.registerTool(
    "create_meeting",
    {
      title: "Create a meeting",
      description:
        "Creates a meeting hosted by one of your users (created on first sight). Give `scheduledAt` for a scheduled meeting, omit it for one that is live right now. Returns the meeting with its guest link.",
      inputSchema: z.object({
        title: meetingTitleSchema,
        host: externalUserSchema.describe(
          "Your user who will host: a stable externalId plus a display name.",
        ),
        externalRef: externalRefSchema
          .optional()
          .describe("Your own reference for this meeting, for lookups later."),
        scheduledAt: z.iso
          .datetime({ offset: true })
          .optional()
          .describe("ISO 8601 with offset. Omit for an instant meeting."),
        durationMinutes:
          scheduledMeetingSchema.shape.durationMinutes.optional(),
        timezone: scheduledMeetingSchema.shape.timezone.optional(),
        passcode: passcodeSchema.optional(),
        settings: meetingSettingsSchema.partial().optional(),
        invitees: scheduledMeetingSchema.shape.invitees
          .optional()
          .describe("Email addresses to invite (scheduled meetings)."),
      }),
    },
    (input) =>
      run(async () => ({
        meeting: toApiMeeting(
          await createIntegrationMeeting(actor, {
            ...input,
            scheduledAt: input.scheduledAt
              ? new Date(input.scheduledAt)
              : undefined,
          }),
        ),
      })),
  );

  server.registerTool(
    "update_meeting",
    {
      title: "Update a meeting",
      description:
        "Changes a meeting's title, time, passcode (empty string removes it), settings or externalRef.",
      inputSchema: z.object({
        code: meetingCodeSchema,
        title: meetingTitleSchema.optional(),
        scheduledAt: z.iso.datetime({ offset: true }).optional(),
        durationMinutes:
          scheduledMeetingSchema.shape.durationMinutes.optional(),
        timezone: scheduledMeetingSchema.shape.timezone.optional(),
        passcode: z.union([z.literal(""), passcodeSchema]).optional(),
        settings: meetingSettingsSchema.partial().optional(),
        externalRef: externalRefSchema.nullable().optional(),
      }),
    },
    ({ code, scheduledAt, ...fields }) =>
      run(async () => {
        const meeting = await requireIntegrationMeeting(
          db,
          integration.id,
          code,
        );
        const updated = await updateIntegrationMeeting(actor, meeting, {
          ...fields,
          ...(scheduledAt ? { scheduledAt: new Date(scheduledAt) } : {}),
        });
        return { meeting: toApiMeeting(updated) };
      }),
  );

  server.registerTool(
    "end_meeting",
    {
      title: "End a meeting",
      description: "Ends the meeting for everyone, as the host would.",
      inputSchema: z.object({ code: meetingCodeSchema }),
      annotations: { destructiveHint: true },
    },
    ({ code }) =>
      run(async () => {
        const meeting = await requireIntegrationMeeting(
          db,
          integration.id,
          code,
        );
        return endMeeting({ db, t }, meeting, actorId);
      }),
  );

  server.registerTool(
    "delete_meeting",
    {
      title: "Delete a meeting",
      description: "Deletes the meeting; its link stops resolving.",
      inputSchema: z.object({ code: meetingCodeSchema }),
      annotations: { destructiveHint: true },
    },
    ({ code }) =>
      run(async () => {
        const meeting = await requireIntegrationMeeting(
          db,
          integration.id,
          code,
        );
        await deleteMeeting({ db, t }, meeting, actorId);
        return { deleted: true };
      }),
  );

  server.registerTool(
    "create_join_link",
    {
      title: "Create a join link",
      description:
        "A signed, short-lived URL that takes one of your users straight into the meeting. Host links are single-use and only for the meeting's host; participant links skip the passcode and waiting room.",
      inputSchema: z.object({
        code: meetingCodeSchema,
        user: externalUserSchema,
        role: z.enum(["host", "participant"]),
        expiresIn: z
          .number()
          .int()
          .min(60)
          .max(MAX_SSO_TTL_SECONDS)
          .optional()
          .describe("Seconds; default 10 minutes, at most 24 hours."),
        returnUrl: z.url().max(2048).optional(),
      }),
    },
    ({ code, ...body }) =>
      run(async () => {
        const meeting = await requireIntegrationMeeting(
          db,
          integration.id,
          code,
        );
        return {
          joinLink: await createJoinLink(db, integration, meeting, body),
        };
      }),
  );

  server.registerTool(
    "list_participants",
    {
      title: "List participants",
      description:
        "The attendance log: one row per connection, with join and leave times.",
      inputSchema: z.object({ code: meetingCodeSchema }),
      annotations: { readOnlyHint: true },
    },
    ({ code }) =>
      run(async () => {
        const meeting = await requireIntegrationMeeting(
          db,
          integration.id,
          code,
        );
        return {
          participants: await listMeetingParticipants(db, integration, meeting),
        };
      }),
  );

  /** Same error envelope as the REST API, as a tool error the agent can read. */
  async function run(work: () => Promise<unknown>): Promise<CallToolResult> {
    try {
      return json(await work());
    } catch (error) {
      const apiError = toApiError(error, t);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: {
                code: apiError.code,
                message: apiError.message,
                details: apiError.details,
              },
            }),
          },
        ],
      };
    }
  }

  return server;
}

function text(value: string): CallToolResult {
  return { content: [{ type: "text", text: value }] };
}

function json(value: unknown): CallToolResult {
  return text(JSON.stringify(value, null, 2));
}
