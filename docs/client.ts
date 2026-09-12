/**
 * Drop-in client for the Gateling Meetings API. Copy this file into the
 * other system (e.g. `src/integrations/meetings.ts`), set
 * `MEETINGS_API_URL` + `MEETINGS_API_KEY` in its environment, and call it
 * from server code only — the API key must never reach a browser.
 *
 * Zero dependencies; `fetch` is the one on Node 18+ / Next.js.
 */

export type MeetingsClientOptions = {
  /** `https://meetings.gateling.com` */
  baseUrl: string;
  /** `gm_live_…` from /settings/integrations. */
  apiKey: string;
  fetch?: typeof fetch;
};

export type ExternalUser = {
  /** Your own stable id for the person (user id, staff id, …). */
  externalId: string;
  name: string;
  email?: string;
};

export type MeetingSettings = {
  waitingRoom: boolean;
  muteOnEntry: boolean;
  allowGuests: boolean;
  allowScreenShare: boolean;
  locked: boolean;
};

export type Meeting = {
  id: string;
  code: string;
  title: string;
  status: "scheduled" | "live" | "ended";
  externalRef: string | null;
  scheduledAt: string | null;
  durationMinutes: number | null;
  timezone: string | null;
  startedAt: string | null;
  endedAt: string | null;
  settings: MeetingSettings;
  hasPasscode: boolean;
  /** The plain share link — passcode and waiting room apply. */
  guestUrl: string;
  createdAt: string;
};

export type CreateMeetingInput = {
  title: string;
  host: ExternalUser;
  /** Your handle for this meeting, e.g. `order:8812`. Searchable later. */
  externalRef?: string;
  /** ISO 8601 with offset. Omit for an instant meeting. */
  scheduledAt?: string;
  durationMinutes?: number;
  /** IANA zone, e.g. `Africa/Cairo`. */
  timezone?: string;
  passcode?: string;
  settings?: Partial<MeetingSettings>;
  /** Emailed an invite + .ics + reminder. */
  invitees?: string[];
};

export type UpdateMeetingInput = Partial<
  Omit<CreateMeetingInput, "host" | "invitees"> & {
    /** `""` removes the passcode. */
    passcode: string;
    externalRef: string | null;
  }
>;

export type JoinLinkInput = {
  user: ExternalUser;
  role: "host" | "participant";
  /** Seconds, 60–86400. Default 600. */
  expiresIn?: number;
  /** Where "Back to <you>" points after the meeting. Must be on an allowed origin. */
  returnUrl?: string;
};

export type JoinLink = {
  url: string;
  role: "host" | "participant";
  expiresAt: string;
  singleUse: boolean;
};

export type Participant = {
  id: string;
  identity: string;
  displayName: string;
  role: "host" | "participant";
  externalId: string | null;
  joinedAt: string;
  leftAt: string | null;
};

export class MeetingsApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "MeetingsApiError";
  }
}

export function createMeetingsClient({
  baseUrl,
  apiKey,
  fetch: fetchImpl = fetch,
}: MeetingsClientOptions) {
  const base = baseUrl.replace(/\/+$/, "");

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const response = await fetchImpl(`${base}/api/v1${path}`, {
      method,
      headers: {
        authorization: `Bearer ${apiKey}`,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...extraHeaders,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (response.status === 204) return undefined as T;
    const json = (await response.json()) as
      | T
      | { error: { code: string; message: string; details?: unknown } };
    if (!response.ok) {
      const { error } = json as {
        error: { code: string; message: string; details?: unknown };
      };
      throw new MeetingsApiError(
        response.status,
        error?.code ?? "unknown",
        error?.message ?? response.statusText,
        error?.details,
      );
    }
    return json as T;
  }

  return {
    /** Pass `idempotencyKey` (e.g. `order:8812:meeting`) to make retries safe. */
    async createMeeting(
      input: CreateMeetingInput,
      idempotencyKey?: string,
    ): Promise<Meeting> {
      const { meeting } = await request<{ meeting: Meeting }>(
        "POST",
        "/meetings",
        input,
        idempotencyKey ? { "idempotency-key": idempotencyKey } : {},
      );
      return meeting;
    },

    async getMeeting(code: string): Promise<Meeting> {
      const { meeting } = await request<{ meeting: Meeting }>(
        "GET",
        `/meetings/${encodeURIComponent(code)}`,
      );
      return meeting;
    },

    async findMeetings(filters: {
      externalRef?: string;
      status?: Meeting["status"];
      limit?: number;
    }): Promise<Meeting[]> {
      const query = new URLSearchParams();
      if (filters.externalRef) query.set("externalRef", filters.externalRef);
      if (filters.status) query.set("status", filters.status);
      if (filters.limit) query.set("limit", String(filters.limit));
      const { meetings } = await request<{ meetings: Meeting[] }>(
        "GET",
        `/meetings?${query}`,
      );
      return meetings;
    },

    async updateMeeting(
      code: string,
      input: UpdateMeetingInput,
    ): Promise<Meeting> {
      const { meeting } = await request<{ meeting: Meeting }>(
        "PATCH",
        `/meetings/${encodeURIComponent(code)}`,
        input,
      );
      return meeting;
    },

    deleteMeeting(code: string): Promise<void> {
      return request<void>("DELETE", `/meetings/${encodeURIComponent(code)}`);
    },

    async endMeeting(code: string): Promise<{ status: Meeting["status"] }> {
      return request("POST", `/meetings/${encodeURIComponent(code)}/end`);
    },

    /**
     * Mint a signed link and `redirect()` the signed-in person to `url`.
     * Host links are single-use and expire in 10 minutes by default — mint
     * one per click, never store it.
     */
    async createJoinLink(
      code: string,
      input: JoinLinkInput,
    ): Promise<JoinLink> {
      const { joinLink } = await request<{ joinLink: JoinLink }>(
        "POST",
        `/meetings/${encodeURIComponent(code)}/join-links`,
        input,
      );
      return joinLink;
    },

    async listParticipants(code: string): Promise<Participant[]> {
      const { participants } = await request<{ participants: Participant[] }>(
        "GET",
        `/meetings/${encodeURIComponent(code)}/participants`,
      );
      return participants;
    },
  };
}

export type MeetingsClient = ReturnType<typeof createMeetingsClient>;
