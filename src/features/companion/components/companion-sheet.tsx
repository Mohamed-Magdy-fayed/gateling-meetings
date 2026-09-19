"use client";

import { fetchServerSentEvents } from "@tanstack/ai-client";
import { useChat } from "@tanstack/ai-react";
import {
  ArrowUpIcon,
  ExternalLinkIcon,
  RotateCcwIcon,
  SparklesIcon,
  SquareIcon,
} from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/features/core/i18n/client";
import { defaultTimeZone } from "@/features/meetings/lib/schedule-time";
import { cn } from "@/lib/utils";

const MAX_MESSAGE_CHARS = 1000;

type ToolName =
  | "list_my_meetings"
  | "create_instant_meeting"
  | "schedule_meeting"
  | "schedule_meeting_series"
  | "get_meeting_link"
  | "get_personal_room_link"
  | "end_meeting"
  | "cancel_meeting";

const TOOL_NAMES: ToolName[] = [
  "list_my_meetings",
  "create_instant_meeting",
  "schedule_meeting",
  "schedule_meeting_series",
  "get_meeting_link",
  "get_personal_room_link",
  "end_meeting",
  "cancel_meeting",
];

/**
 * A non-OK reply from `/api/companion` carries a translated `error` (an
 * allowance, a rate limit, a paused companion). Surface that sentence
 * instead of the adapter's generic status text.
 */
async function companionFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, init);
  if (response.ok) return response;
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  throw new Error(body?.error ?? response.statusText);
}

/**
 * The in-app assistant: a chat in a side sheet that starts, schedules and
 * links meetings for the signed-in person. Only ever about meetings; the
 * server enforces that and the daily allowance.
 */
export function CompanionSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, locale } = useTranslation();
  const [draft, setDraft] = useState("");
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(
    null,
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, isLoading, error, stop, setMessages } =
    useChat({
      connection: fetchServerSentEvents("/api/companion", () => ({
        body: { timeZone: defaultTimeZone(), locale },
        fetchClient: companionFetch,
      })),
    });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/companion")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { used: number; limit: number } | null) => {
        if (!cancelled && data) setUsage(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Pin the latest turn into view as it streams in.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on every new chunk
  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, isLoading]);

  async function submit(text: string) {
    const content = text.trim();
    if (!content || isLoading) return;
    setDraft("");
    await sendMessage(content);
    setUsage((current) =>
      current
        ? { ...current, used: Math.min(current.used + 1, current.limit) }
        : current,
    );
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(draft);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void submit(draft);
    }
  }

  const suggestions = [
    t("companion.suggestions.now"),
    t("companion.suggestions.tomorrow"),
    t("companion.suggestions.room"),
  ];
  const exhausted = usage != null && usage.used >= usage.limit;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        aria-describedby={undefined}
      >
        <SheetHeader className="flex-row items-center gap-3 border-b border-border p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-primary">
            <SparklesIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <SheetTitle className="text-base">
              {t("companion.title")}
            </SheetTitle>
            <SheetDescription className="truncate">
              {usage
                ? t("companion.usage", {
                    used: usage.used,
                    limit: usage.limit,
                  })
                : t("companion.lead")}
            </SheetDescription>
          </div>
          {messages.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("companion.clear")}
              onClick={() => setMessages([])}
              disabled={isLoading}
            >
              <RotateCcwIcon />
            </Button>
          )}
        </SheetHeader>

        <SheetBody
          ref={scrollRef}
          className="flex-1 space-y-3 overflow-y-auto p-4 text-sm"
        >
          {messages.length === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border/60 p-6 text-center">
              <span className="grid size-16 place-items-center rounded-full bg-accent text-primary">
                <SparklesIcon className="size-7" />
              </span>
              <p className="text-balance text-muted-foreground">
                {t("companion.lead")}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                    onClick={() => void submit(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))
          )}
          {isLoading && (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {t("companion.thinking")}
            </p>
          )}
          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error.message || t("companion.errors.failed")}
            </p>
          )}
        </SheetBody>

        <SheetFooter className="border-t border-border p-3">
          <form onSubmit={onSubmit} className="flex w-full items-end gap-2">
            <Textarea
              value={draft}
              onChange={(event) =>
                setDraft(event.target.value.slice(0, MAX_MESSAGE_CHARS))
              }
              onKeyDown={onKeyDown}
              placeholder={t("companion.placeholder")}
              aria-label={t("companion.placeholder")}
              rows={1}
              disabled={exhausted}
              className="max-h-32 min-h-9 flex-1 resize-none"
            />
            {isLoading ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={t("companion.stop")}
                onClick={stop}
              >
                <SquareIcon />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                aria-label={t("companion.send")}
                disabled={!draft.trim() || exhausted}
              >
                <ArrowUpIcon />
              </Button>
            )}
          </form>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

type Message = ReturnType<typeof useChat>["messages"][number];

function MessageBubble({ message }: { message: Message }) {
  const { t } = useTranslation();
  const isUser = message.role === "user";
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5",
        isUser ? "items-end" : "items-start",
      )}
    >
      {/* Parts carry no id; a streamed message only ever appends, so position is stable. */}
      {message.parts.map((part, index) => {
        const key = `${message.id}-${index}`;
        if (part.type === "text") {
          if (!part.content) return null;
          return (
            <div
              key={key}
              className={cn(
                "min-w-0 max-w-[85%] whitespace-pre-wrap wrap-anywhere rounded-lg px-3 py-2 leading-relaxed",
                isUser
                  ? "bg-accent text-accent-foreground"
                  : "border border-border bg-card",
              )}
            >
              {renderWithLinks(part.content)}
            </div>
          );
        }
        if (part.type === "tool-call") {
          return (
            <ToolLine
              key={key}
              name={part.name}
              output={part.output}
              label={
                isToolName(part.name)
                  ? t(`companion.toolRan.${part.name}`)
                  : part.name
              }
            />
          );
        }
        return null;
      })}
    </div>
  );
}

function ToolLine({
  name,
  output,
  label,
}: {
  name: string;
  output: unknown;
  label: string;
}) {
  const links = linksFrom(output);
  return (
    <p
      className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
      data-tool={name}
    >
      <span>{label}</span>
      {links.map((link) => (
        <a
          key={link}
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 font-mono text-foreground transition-colors hover:bg-muted"
        >
          <span className="truncate">{link.replace(/^https?:\/\//, "")}</span>
          <ExternalLinkIcon className="size-3 shrink-0" />
        </a>
      ))}
    </p>
  );
}

const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/g;
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;

/**
 * The model writes links as plain text; make them tappable. Trailing
 * punctuation ("...here: http://x.") stays outside the anchor. Runs of
 * blank lines collapse to one so a bubble never carries dead space.
 */
function renderWithLinks(content: string) {
  const text = content.trim().replace(/\n{3,}/g, "\n\n");
  return text.split(URL_PATTERN).map((chunk, index) => {
    if (index % 2 === 0) return chunk;
    const trailing = chunk.match(TRAILING_PUNCTUATION)?.[0] ?? "";
    const href = chunk.slice(0, chunk.length - trailing.length);
    return (
      // biome-ignore lint/suspicious/noArrayIndexKey: chunks are positional within one part
      <span key={index}>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all font-medium text-primary underline underline-offset-2"
        >
          {href}
        </a>
        {trailing}
      </span>
    );
  });
}

function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as string[]).includes(name);
}

/**
 * Tool outputs arrive as an object or a JSON string. A single meeting
 * carries `link`; a series carries `scheduled[].link`, one per occurrence.
 */
function linksFrom(output: unknown): string[] {
  let value = output;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!value || typeof value !== "object") return [];
  const { link, scheduled } = value as { link?: unknown; scheduled?: unknown };
  const candidates = Array.isArray(scheduled)
    ? scheduled.map((row: unknown) =>
        row && typeof row === "object"
          ? (row as { link?: unknown }).link
          : null,
      )
    : [link];
  return candidates.filter(
    (candidate): candidate is string =>
      typeof candidate === "string" && /^https?:\/\//.test(candidate),
  );
}
