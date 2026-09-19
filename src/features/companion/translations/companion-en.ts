export const companionEn = {
  title: "Companion",
  lead: "Ask for a meeting in plain words. It starts, schedules, invites and hands you the link.",
  open: "Open the companion",
  placeholder: "Start a meeting, schedule one, get a link…",
  send: "Send",
  stop: "Stop",
  clear: "Clear",
  thinking: "Working on it…",
  suggestions: {
    now: "Start a meeting now",
    tomorrow: "Schedule a meeting tomorrow at 12 PM with a colleague",
    room: "Give me my personal room link",
  },
  toolRan: {
    list_my_meetings: "Looked up your meetings",
    create_instant_meeting: "Started a meeting",
    schedule_meeting: "Scheduled a meeting",
    get_meeting_link: "Fetched a link",
    get_personal_room_link: "Fetched your room link",
    end_meeting: "Ended a meeting",
    cancel_meeting: "Cancelled a meeting",
  },
  openLink: "Open",
  usage: "{used:number} of {limit:number} messages today",
  errors: {
    tooLong: "Keep it under 1,000 characters and try again.",
    slowDown: "Too many messages at once. Give it a minute.",
    dailyLimit:
      "You've used today's {limit:number} companion messages. More at {when:date}.",
    paused: "The companion is paused for now. Try again later.",
    failed: "That didn't go through. Try again.",
  },
} as const;
