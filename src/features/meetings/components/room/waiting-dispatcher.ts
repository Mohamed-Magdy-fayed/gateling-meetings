/**
 * Admit / deny / admit-all, one at a time, from any entry point (the
 * participants panel, the floating window's strip, the opener's toast).
 * Pure (no React, no tRPC) so the race rules are unit-tested:
 * - a second action while one is in flight is ignored, not queued;
 * - resolved requests are hidden at once (optimistic) and stay hidden, so
 *   a poll that was already on its way back cannot bring the row back;
 * - a failure un-hides the row(s) and reports a translation key, except
 *   NOT_FOUND (someone else resolved it first), which just stays resolved.
 */

export type WaitingPending =
  | { kind: "one"; id: string }
  | { kind: "all" }
  | null;

export type WaitingErrorKey =
  | "meetings.waiting.actionFailed"
  | "meetings.waiting.notHost"
  | "meetings.waiting.offline";

/** Where the action started: toast failures toast, the rest render inline. */
export type WaitingSource = "toast" | "inline";

type ErrorLike = { data?: { code?: unknown } | null; message?: unknown };

function trpcCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error == null) return undefined;
  const code = (error as ErrorLike).data?.code;
  return typeof code === "string" ? code : undefined;
}

/** The message for a failed action, or null when there is nothing to report. */
export function waitingErrorKey(
  error: unknown,
  isOnline: boolean,
): WaitingErrorKey | null {
  const code = trpcCode(error);
  if (code === "NOT_FOUND") return null;
  if (code === "FORBIDDEN" || code === "UNAUTHORIZED") {
    return "meetings.waiting.notHost";
  }
  if (code == null) {
    const message =
      typeof error === "object" && error != null
        ? String((error as ErrorLike).message ?? "")
        : "";
    if (!isOnline || /fetch|network/i.test(message)) {
      return "meetings.waiting.offline";
    }
  }
  return "meetings.waiting.actionFailed";
}

type DispatcherDeps = {
  onChange: (state: {
    pending: WaitingPending;
    error: WaitingErrorKey | null;
  }) => void;
  /** A failure started from a toast is reported as a toast. */
  onToastError: (key: WaitingErrorKey) => void;
  /** Stops in-flight polls before hiding rows. */
  beforeRun: () => Promise<void>;
  /** Refetches the list once the action settles. */
  afterRun: () => void;
  isOnline: () => boolean;
};

export class WaitingDispatcher {
  private pending: WaitingPending = null;
  private error: WaitingErrorKey | null = null;
  private readonly hidden = new Set<string>();

  constructor(private readonly deps: DispatcherDeps) {}

  get isBusy() {
    return this.pending != null;
  }

  /** The list minus everything already resolved here. */
  visible<T extends { id: string }>(list: readonly T[]): T[] {
    return list.filter((request) => !this.hidden.has(request.id));
  }

  /**
   * Runs one action; `ids` are the rows it resolves. Returns false when it
   * was ignored because another action is in flight.
   */
  async run(
    target: { kind: "one"; id: string } | { kind: "all"; ids: string[] },
    call: () => Promise<unknown>,
    source: WaitingSource = "inline",
  ): Promise<boolean> {
    if (this.pending) return false;
    const ids = target.kind === "one" ? [target.id] : target.ids;
    this.pending = target.kind === "one" ? target : { kind: "all" };
    this.error = null;
    this.emit();
    try {
      await this.deps.beforeRun();
      for (const id of ids) this.hidden.add(id);
      this.emit();
      await call();
    } catch (error) {
      const key = waitingErrorKey(error, this.deps.isOnline());
      if (key) {
        for (const id of ids) this.hidden.delete(id);
        if (source === "toast") this.deps.onToastError(key);
        else this.error = key;
      }
    } finally {
      this.pending = null;
      this.emit();
      this.deps.afterRun();
    }
    return true;
  }

  private emit() {
    this.deps.onChange({ pending: this.pending, error: this.error });
  }
}
