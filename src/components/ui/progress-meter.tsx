"use client";

import { Progress } from "@/components/ui/progress";

/**
 * A labelled percentage bar. Small enough to be a shared piece rather than
 * repeated markup across the trainee card and the group roster.
 */
export function ProgressMeter({
  label,
  detail,
  percent,
}: {
  label: string;
  detail?: string;
  percent: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-sm">{label}</span>
        <span className="text-muted-foreground text-xs">
          {detail ? `${detail} · ` : ""}
          {percent}%
        </span>
      </div>
      {/* aria-valuetext rather than the raw number so a screen reader reads
          "3 of 8 levels" instead of a bare "38". */}
      <Progress value={percent} aria-label={label} aria-valuetext={detail} />
    </div>
  );
}
