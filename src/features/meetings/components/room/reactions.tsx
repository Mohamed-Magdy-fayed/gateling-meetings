"use client";

import { useDataChannel } from "@livekit/components-react";
import { SmilePlusIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTranslation } from "@/features/core/i18n/client";
import { cn } from "@/lib/utils";

const REACTION_TOPIC = "reaction";
const REACTIONS = ["👍", "👏", "❤️", "😂", "😮", "🎉"] as const;
const REACTION_LIFETIME_MS = 3_000;

type Reaction = {
  id: number;
  emoji: string;
  from: string;
  /** Horizontal offset (%) so simultaneous reactions don't stack. */
  x: number;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Reactions are fire-and-forget data messages on their own topic: nothing
 * is stored, late joiners don't see old ones, and the SFU fans them out
 * without any server code of ours. The sender sees their own too — the
 * data channel does not echo, so it is added locally on send.
 */
export function useReactions(localName: string) {
  const [reactions, setReactions] = useState<Reaction[]>([]);

  const push = useCallback((emoji: string, from: string) => {
    const id = Date.now() + Math.random();
    setReactions((current) => [
      ...current,
      { id, emoji, from, x: 10 + Math.random() * 80 },
    ]);
    setTimeout(() => {
      setReactions((current) => current.filter((r) => r.id !== id));
    }, REACTION_LIFETIME_MS);
  }, []);

  const { send } = useDataChannel(REACTION_TOPIC, (message) => {
    const emoji = decoder.decode(message.payload);
    if (!(REACTIONS as readonly string[]).includes(emoji)) return;
    push(emoji, message.from?.name ?? message.from?.identity ?? "");
  });

  async function react(emoji: string) {
    push(emoji, localName);
    await send(encoder.encode(emoji), { reliable: false });
  }

  return { reactions, react };
}

export function ReactionsOverlay({ reactions }: { reactions: Reaction[] }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 overflow-hidden"
    >
      {reactions.map((reaction) => (
        <span
          key={reaction.id}
          style={{ insetInlineStart: `${reaction.x}%` }}
          className="absolute bottom-4 flex flex-col items-center gap-1 motion-safe:animate-[reaction-float_3s_ease-out_forwards]"
        >
          <span className="text-4xl drop-shadow">{reaction.emoji}</span>
          <span className="rounded-full bg-black/50 px-2 py-0.5 text-[0.625rem] text-white">
            {reaction.from}
          </span>
        </span>
      ))}
    </div>
  );
}

export function ReactionPicker({
  onReact,
  className,
}: {
  onReact: (emoji: string) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  // Close after a pick so the bar is clear again.
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => setOpen(false), 5_000);
    return () => clearTimeout(id);
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={t("meetings.room.reactions")}
            className={cn(
              "grid size-12 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-white transition-all ease-spring hover:-translate-y-px hover:bg-white/[0.12] active:translate-y-0 active:scale-95 [&_svg]:size-5",
              className,
            )}
          />
        }
      >
        <SmilePlusIcon />
      </PopoverTrigger>
      <PopoverContent side="top" className="dark w-auto p-1">
        <div className="flex gap-1">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="grid size-10 place-items-center rounded-lg text-2xl transition-transform hover:scale-125 focus-visible:scale-125"
              onClick={() => {
                onReact(emoji);
                setOpen(false);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
