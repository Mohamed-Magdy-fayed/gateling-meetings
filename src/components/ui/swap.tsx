"use client";

import { Slot as SlotPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

type SwapMode = "dark" | "rtl";
type SwapAnimation = "fade" | "rotate" | "flip" | "scale";

interface SwapContextValue {
  mode: SwapMode;
  animation: SwapAnimation;
  forceTransition: boolean;
}

const SwapContext = React.createContext<SwapContextValue | null>(null);

function useSwapContext() {
  const ctx = React.useContext(SwapContext);
  if (!ctx) throw new Error("`SwapOn`/`SwapOff` must be used within `Swap`");
  return ctx;
}

interface DivProps extends React.ComponentProps<"div"> {
  asChild?: boolean;
}

export interface SwapProps extends DivProps {
  mode: SwapMode;
  animation?: SwapAnimation;
  /** Override next-themes disableTransitionOnChange suppression for this swap only */
  forceTransition?: boolean;
}

// SwapOn: hidden by default, visible when mode is active
const swapOnClasses: Record<SwapMode, Record<SwapAnimation, string>> = {
  dark: {
    fade: "absolute opacity-0 dark:relative dark:opacity-100",
    rotate:
      "absolute opacity-0 rotate-180 dark:relative dark:opacity-100 dark:rotate-0 motion-reduce:rotate-0",
    flip: "absolute opacity-0 [transform:rotateY(180deg)] dark:relative dark:opacity-100 dark:[transform:rotateY(0deg)] motion-reduce:[transform:rotateY(0deg)]",
    scale:
      "absolute opacity-0 scale-0 dark:relative dark:opacity-100 dark:scale-100",
  },
  rtl: {
    fade: "absolute opacity-0 rtl:relative rtl:opacity-100",
    rotate:
      "absolute opacity-0 rotate-180 rtl:relative rtl:opacity-100 rtl:rotate-0 motion-reduce:rotate-0",
    flip: "absolute opacity-0 [transform:rotateY(180deg)] rtl:relative rtl:opacity-100 rtl:[transform:rotateY(0deg)] motion-reduce:[transform:rotateY(0deg)]",
    scale:
      "absolute opacity-0 scale-0 rtl:relative rtl:opacity-100 rtl:scale-100",
  },
};

// SwapOff: visible by default, hidden when mode is active
const swapOffClasses: Record<SwapMode, Record<SwapAnimation, string>> = {
  dark: {
    fade: "relative opacity-100 dark:absolute dark:opacity-0",
    rotate:
      "relative opacity-100 rotate-0 dark:absolute dark:opacity-0 dark:rotate-180 motion-reduce:dark:rotate-0",
    flip: "relative opacity-100 [transform:rotateY(0deg)] dark:absolute dark:opacity-0 dark:[transform:rotateY(180deg)] motion-reduce:dark:[transform:rotateY(0deg)]",
    scale:
      "relative opacity-100 scale-100 dark:absolute dark:opacity-0 dark:scale-0",
  },
  rtl: {
    fade: "relative opacity-100 rtl:absolute rtl:opacity-0",
    rotate:
      "relative opacity-100 rotate-0 rtl:absolute rtl:opacity-0 rtl:rotate-180 motion-reduce:rtl:rotate-0",
    flip: "relative opacity-100 [transform:rotateY(0deg)] rtl:absolute rtl:opacity-0 rtl:[transform:rotateY(180deg)] motion-reduce:rtl:[transform:rotateY(0deg)]",
    scale:
      "relative opacity-100 scale-100 rtl:absolute rtl:opacity-0 rtl:scale-0",
  },
};

export function Swap({
  mode,
  animation = "fade",
  forceTransition = false,
  asChild,
  className,
  children,
  ...props
}: SwapProps) {
  const Root = asChild ? SlotPrimitive.Slot : "div";
  return (
    <SwapContext.Provider value={{ mode, animation, forceTransition }}>
      <Root
        data-slot="swap"
        data-animation={animation}
        className={cn(
          "relative inline-flex cursor-pointer select-none items-center justify-center",
          className,
        )}
        {...props}
      >
        {children}
      </Root>
    </SwapContext.Provider>
  );
}

export function SwapOn({ asChild, className, ...props }: DivProps) {
  const { mode, animation, forceTransition } = useSwapContext();
  const Root = asChild ? SlotPrimitive.Slot : "div";
  return (
    <Root
      data-slot="swap-on"
      aria-hidden="true"
      {...props}
      className={cn(
        forceTransition
          ? "transition-all! duration-300!"
          : "transition-all duration-300 motion-reduce:transition-none",
        swapOnClasses[mode][animation],
        className,
      )}
    />
  );
}

export function SwapOff({ asChild, className, ...props }: DivProps) {
  const { mode, animation, forceTransition } = useSwapContext();
  const Root = asChild ? SlotPrimitive.Slot : "div";
  return (
    <Root
      data-slot="swap-off"
      aria-hidden="true"
      {...props}
      className={cn(
        forceTransition
          ? "transition-all! duration-300!"
          : "transition-all duration-300 motion-reduce:transition-none",
        swapOffClasses[mode][animation],
        className,
      )}
    />
  );
}
