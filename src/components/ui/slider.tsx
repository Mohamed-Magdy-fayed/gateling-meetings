"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import * as React from "react";

import { cn } from "@/lib/utils";

type SliderProps = SliderPrimitive.Root.Props & {
  trackClassName?: string;
  indicatorClassName?: string;
  thumbClassName?: string;
};

function Slider({
  className,
  trackClassName,
  indicatorClassName,
  thumbClassName,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: SliderProps) {
  const values = React.useMemo(() => {
    if (Array.isArray(value)) return value;
    if (typeof value === "number") return [value];
    if (Array.isArray(defaultValue)) return defaultValue;
    if (typeof defaultValue === "number") return [defaultValue];
    return [min, max];
  }, [value, defaultValue, min, max]);

  return (
    <SliderPrimitive.Root
      dir="ltr"
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none select-none items-center data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Control
        data-slot="slider-control"
        className="relative flex h-5 w-full items-center"
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className={cn(
            "relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted",
            trackClassName,
          )}
        >
          <SliderPrimitive.Indicator
            data-slot="slider-indicator"
            className={cn("absolute h-full bg-primary", indicatorClassName)}
          />
        </SliderPrimitive.Track>
        {values.map((_, index) => (
          <SliderPrimitive.Thumb
            // biome-ignore lint/suspicious/noArrayIndexKey: thumb count is fixed by props (single/range), positions aren't reordered
            key={index}
            index={index}
            data-slot="slider-thumb"
            className={cn(
              "block size-4 shrink-0 rounded-full border border-primary bg-background shadow-sm ring-ring/50 transition-[color,box-shadow] hover:ring-4 focus-visible:outline-hidden focus-visible:ring-4 disabled:pointer-events-none disabled:opacity-50",
              thumbClassName,
            )}
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
