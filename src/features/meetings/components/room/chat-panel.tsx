"use client";

import type { ReceivedChatMessage } from "@livekit/components-core";
import { useLocalParticipant } from "@livekit/components-react";
import { SendHorizonalIcon } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/features/core/i18n/client";
import { cn } from "@/lib/utils";

export type ChatState = {
  chatMessages: ReceivedChatMessage[];
  send: (message: string) => Promise<unknown>;
  isSending: boolean;
};

/**
 * In-meeting chat over LiveKit's data channel. Messages live only for the
 * session — nothing is persisted, which is the right default for a room
 * people join by link.
 *
 * The chat state is owned by the room shell (one `useChat()` for the whole
 * room) and passed in: LiveKit's message stream does not replay, so a panel
 * that called `useChat()` itself would open empty if it mounted after the
 * first message arrived.
 */
export function ChatPanel({ chatMessages, send, isSending }: ChatState) {
  const { t, locale } = useTranslation();
  const { localParticipant } = useLocalParticipant();
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // Stick to the bottom as messages arrive.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever the list length changes
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chatMessages.length]);

  const timeFormat = new Intl.DateTimeFormat(locale, { timeStyle: "short" });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!message) return;
    setDraft("");
    await send(message);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={listRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3"
      >
        {chatMessages.length === 0 && (
          <p className="pt-8 text-center text-sm text-muted-foreground">
            {t("meetings.room.chatEmpty")}
          </p>
        )}
        {chatMessages.map((message) => {
          const isMine = message.from?.identity === localParticipant.identity;
          const author = isMine
            ? t("meetings.room.you")
            : (message.from?.name ?? message.from?.identity ?? "");
          return (
            <div
              key={message.id ?? message.timestamp}
              className={cn(
                "flex flex-col gap-0.5",
                isMine ? "items-end" : "items-start",
              )}
            >
              <span className="px-1 text-[0.6875rem] text-muted-foreground">
                {author} · {timeFormat.format(message.timestamp)}
              </span>
              <p
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm",
                  isMine
                    ? "rounded-ee-sm bg-primary text-primary-foreground"
                    : "rounded-es-sm bg-muted text-foreground",
                )}
              >
                {message.message}
              </p>
            </div>
          );
        })}
      </div>

      <form onSubmit={submit} className="flex gap-2 border-t border-border p-3">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t("meetings.room.chatPlaceholder")}
          aria-label={t("meetings.room.chatPlaceholder")}
          maxLength={2000}
          className="h-9"
          autoComplete="off"
        />
        <Button
          type="submit"
          size="icon-lg"
          className="size-9"
          disabled={isSending || !draft.trim()}
          aria-label={t("meetings.room.send")}
        >
          <SendHorizonalIcon className="rtl:-scale-x-100" />
        </Button>
      </form>
    </div>
  );
}
