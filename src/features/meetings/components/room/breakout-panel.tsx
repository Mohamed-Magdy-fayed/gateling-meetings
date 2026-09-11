"use client";

import { useParticipants } from "@livekit/components-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DoorOpenIcon,
  PlusIcon,
  SendHorizonalIcon,
  ShuffleIcon,
  XIcon,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/features/core/i18n/client";
import { useTRPC } from "@/integrations/trpc/client";
import { useCurrentRoom } from "./use-current-room";

const POLL_INTERVAL_MS = 4_000;

type BreakoutPanelProps = { code: string; hostIdentity: string };

/**
 * Host-only. Draft rooms → assign people (by hand or shuffle) → Open moves
 * everyone at once → the host can drop into any room → Close brings all
 * home. Assignments live in the DB so they survive a host refresh; the
 * moves themselves are LiveKit server-side and need no cooperation from
 * the moved browser.
 */
export function BreakoutPanel({ code, hostIdentity }: BreakoutPanelProps) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const participants = useParticipants();
  const current = useCurrentRoom();

  const listOptions = trpc.breakouts.list.queryOptions(
    { code },
    { refetchInterval: POLL_INTERVAL_MS },
  );
  const { data: rooms = [] } = useQuery(listOptions);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: listOptions.queryKey });
  const onError = (error: { message: string }) => toast.error(error.message);
  const options = { onSuccess: refresh, onError };

  const create = useMutation(trpc.breakouts.create.mutationOptions(options));
  const remove = useMutation(trpc.breakouts.remove.mutationOptions(options));
  const assign = useMutation(trpc.breakouts.assign.mutationOptions(options));
  const unassign = useMutation(
    trpc.breakouts.unassign.mutationOptions(options),
  );
  const autoAssign = useMutation(
    trpc.breakouts.autoAssign.mutationOptions(options),
  );
  const open = useMutation(
    trpc.breakouts.open.mutationOptions({
      ...options,
      onSuccess: ({ moved }) => {
        toast.success(t("meetings.breakouts.opened", { count: moved }));
        refresh();
      },
    }),
  );
  const closeAll = useMutation(
    trpc.breakouts.closeAll.mutationOptions(options),
  );
  const visit = useMutation(trpc.breakouts.visit.mutationOptions({ onError }));
  const broadcast = useMutation(
    trpc.breakouts.broadcast.mutationOptions({
      onError,
      onSuccess: () => setMessage(""),
    }),
  );

  const [count, setCount] = useState("2");
  const [message, setMessage] = useState("");

  const isOpen = rooms.some((room) => room.status === "open");
  const assignedIdentities = new Set(
    rooms.flatMap((room) => room.assignments.map((a) => a.identity)),
  );
  // People here with the host who are not yet in any room. Only meaningful
  // while the host is in the main room — inside a breakout the list is that
  // room's members.
  const unassigned = current.breakout
    ? []
    : participants.filter(
        (p) =>
          p.identity !== hostIdentity && !assignedIdentities.has(p.identity),
      );

  function submitBroadcast(event: FormEvent) {
    event.preventDefault();
    if (message.trim()) broadcast.mutate({ code, message });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {rooms.length === 0 ? (
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate({ code, count: Number(count) });
            }}
          >
            <label
              htmlFor="breakout-count"
              className="flex-1 space-y-1 text-xs text-muted-foreground"
            >
              {t("meetings.breakouts.howMany")}
              <Input
                id="breakout-count"
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={(event) => setCount(event.target.value)}
                className="h-9"
              />
            </label>
            <Button type="submit" className="h-9" disabled={create.isPending}>
              <PlusIcon data-icon="inline-start" />
              {t("meetings.breakouts.create")}
            </Button>
          </form>
        ) : (
          <>
            {rooms.map((room) => (
              <section
                key={room.id}
                className="rounded-lg border border-white/10 bg-white/[0.03] p-2"
              >
                <div className="flex items-center justify-between gap-2 px-1">
                  <h3 className="text-sm font-medium">{room.name}</h3>
                  <div className="flex items-center gap-1">
                    {room.status === "open" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={
                          visit.isPending ||
                          current.name === room.liveKitRoomName
                        }
                        onClick={() => visit.mutate({ code, roomId: room.id })}
                      >
                        <DoorOpenIcon data-icon="inline-start" />
                        {t("meetings.breakouts.join")}
                      </Button>
                    )}
                    {room.status === "draft" && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t("actions.delete")}
                        onClick={() => remove.mutate({ code, roomId: room.id })}
                      >
                        <XIcon />
                      </Button>
                    )}
                  </div>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {room.assignments.length === 0 && (
                    <li className="px-1 text-xs text-muted-foreground">
                      {t("meetings.breakouts.empty")}
                    </li>
                  )}
                  {room.assignments.map((assignment) => (
                    <li
                      key={assignment.identity}
                      className="flex items-center justify-between gap-2 rounded-md px-1 py-0.5 text-sm"
                    >
                      <span className="truncate">{assignment.displayName}</span>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label={t("meetings.breakouts.unassign")}
                        onClick={() =>
                          unassign.mutate({
                            code,
                            identity: assignment.identity,
                          })
                        }
                      >
                        <XIcon />
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            {unassigned.length > 0 && (
              <section className="space-y-1">
                <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("meetings.breakouts.unassigned")}
                </h3>
                <ul className="space-y-1">
                  {unassigned.map((participant) => (
                    <li
                      key={participant.identity}
                      className="flex items-center gap-2 px-1"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {participant.name || participant.identity}
                      </span>
                      <Select
                        value={null}
                        onValueChange={(roomId) => {
                          if (typeof roomId !== "string" || !roomId) return;
                          assign.mutate({
                            code,
                            roomId,
                            identity: participant.identity,
                            displayName:
                              participant.name || participant.identity,
                          });
                        }}
                      >
                        <SelectTrigger
                          size="sm"
                          className="w-32"
                          aria-label={t("meetings.breakouts.assignTo")}
                        >
                          <SelectValue
                            placeholder={t("meetings.breakouts.assignTo")}
                          />
                        </SelectTrigger>
                        <SelectContent className="dark">
                          {rooms.map((room) => (
                            <SelectItem key={room.id} value={room.id}>
                              {room.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={autoAssign.isPending}
                onClick={() => autoAssign.mutate({ code })}
              >
                <ShuffleIcon data-icon="inline-start" />
                {t("meetings.breakouts.autoAssign")}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={create.isPending}
                onClick={() => create.mutate({ code, count: 1 })}
              >
                <PlusIcon data-icon="inline-start" />
                {t("meetings.breakouts.addRoom")}
              </Button>
            </div>
          </>
        )}
      </div>

      {rooms.length > 0 && (
        <div className="space-y-2 border-t border-white/10 p-3">
          {isOpen && (
            <form onSubmit={submitBroadcast} className="flex gap-2">
              <Input
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={t("meetings.breakouts.broadcastPlaceholder")}
                aria-label={t("meetings.breakouts.broadcastPlaceholder")}
                className="h-9"
                maxLength={500}
              />
              <Button
                type="submit"
                size="icon-lg"
                className="size-9"
                variant="secondary"
                disabled={broadcast.isPending || !message.trim()}
                aria-label={t("meetings.breakouts.broadcast")}
              >
                <SendHorizonalIcon className="rtl:-scale-x-100" />
              </Button>
            </form>
          )}
          {isOpen ? (
            <Button
              className="w-full"
              variant="destructive"
              disabled={closeAll.isPending}
              onClick={() => closeAll.mutate({ code })}
            >
              {t("meetings.breakouts.closeAll")}
            </Button>
          ) : (
            <Button
              className="w-full"
              disabled={open.isPending}
              onClick={() => open.mutate({ code })}
            >
              {t("meetings.breakouts.open")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
