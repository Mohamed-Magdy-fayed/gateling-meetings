"use client";

import { useMediaDevices } from "@livekit/components-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type DeviceSelectProps = {
  kind: "audioinput" | "videoinput";
  value: string;
  onChange: (deviceId: string) => void;
  emptyLabel: string;
  ariaLabel: string;
  className?: string;
};

/**
 * A camera/microphone picker. Labels are empty until the browser has granted
 * media permission once, so a device without a label falls back to a
 * generic "Camera 1"-style name rather than an empty row.
 */
export function DeviceSelect({
  kind,
  value,
  onChange,
  emptyLabel,
  ariaLabel,
  className,
}: DeviceSelectProps) {
  const devices = useMediaDevices({ kind });

  if (devices.length === 0) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        {emptyLabel}
      </p>
    );
  }

  const selected = devices.find((device) => device.deviceId === value)
    ? value
    : (devices[0]?.deviceId ?? "");

  return (
    <Select value={selected} onValueChange={(next) => next && onChange(next)}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn("w-full max-w-full", className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {devices.map((device, index) => (
          <SelectItem key={device.deviceId} value={device.deviceId}>
            {device.label || `${ariaLabel} ${index + 1}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
