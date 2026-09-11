"use client";

import type { ComponentProps, FormEventHandler, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type OverlayFormBodyProps = Omit<
  ComponentProps<"form">,
  "id" | "onSubmit"
> & {
  formId: string;
  onSubmit: FormEventHandler<HTMLFormElement>;
};

/**
 * The scrollable body of an overlay form — the flex child that absorbs the
 * overflow so the dialog's header and footer stay pinned. `min-h-0` is what
 * makes that work: without it a flex child won't shrink below its content and
 * the popup's `max-h` has nothing to clamp.
 *
 * The submit button lives in the footer, outside this `<form>`, and reaches it
 * through the `form={formId}` attribute — so scrolling this element away never
 * detaches the button (see `OverlayFormSubmitButton`).
 */
export function OverlayFormBody({
  formId,
  onSubmit,
  className,
  ...props
}: OverlayFormBodyProps) {
  return (
    <form
      id={formId}
      onSubmit={onSubmit}
      // `-mx-1 px-1`: an `overflow-y` container also clips on the x axis, and
      // full-width fields sit flush against this element's edge — the 4px of
      // bleed keeps their focus rings from being cut off.
      className={cn("-mx-1 min-h-0 flex-1 overflow-y-auto px-1", className)}
      {...props}
    />
  );
}

export type OverlayFormSubmitButtonProps = Omit<
  ComponentProps<typeof Button>,
  "form" | "type"
> & {
  formId: string;
};

export function OverlayFormSubmitButton({
  formId,
  className,
  ...props
}: OverlayFormSubmitButtonProps) {
  return (
    <Button
      {...props}
      type="submit"
      form={formId}
      className={cn("flex-1", className)}
    />
  );
}

export function OverlayFormFooterActions({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-2 justify-end", className)}>{children}</div>
  );
}
