"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDevicesOfKind } from "@/features/meetings/lib/media";
import { cn } from "@/lib/utils";

type DeviceSelectProps = {
  kind: MediaDeviceKind;
  value: string;
  onChange: (deviceId: string) => void;
  emptyLabel: string;
  ariaLabel: string;
  className?: string;
};

/**
 * A camera/microphone/speaker picker. Labels are empty until the browser has
 * granted media permission once, so a device without a label falls back to
 * a generic "Camera 1"-style name rather than an empty row. The list comes
 * from the shared device store, so it refreshes on plug/unplug and the
 * moment permission is granted.
 */
export function DeviceSelect({
  kind,
  value,
  onChange,
  emptyLabel,
  ariaLabel,
  className,
}: DeviceSelectProps) {
  const devices = useDevicesOfKind(kind);

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
  const items = devices.map((device, index) => ({
    value: device.deviceId,
    label: device.label || `${ariaLabel} ${index + 1}`,
  }));

  return (
    // `items` lets the closed trigger show the label; without it Base UI
    // prints the raw device id until the list has been opened once.
    <Select
      items={items}
      value={selected}
      onValueChange={(next) => next && onChange(next)}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn("w-full max-w-full", className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
