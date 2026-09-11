import { cva, type VariantProps } from "class-variance-authority";
import { XIcon } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

const tagVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap transition-all ease-spring select-none",
  {
    variants: {
      color: {
        neutral: "border-border bg-muted text-foreground",
        orange:
          "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300",
        blue: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
        green:
          "border-mint-200 bg-mint-50 text-mint-700 dark:border-mint-800 dark:bg-mint-950/40 dark:text-mint-300",
        violet: "border-violet-100 bg-violet-100 text-violet-600",
      },
      selected: {
        true: "border-transparent bg-primary text-primary-foreground",
        false: "",
      },
      interactive: {
        true: "cursor-pointer hover:-translate-y-px",
        false: "",
      },
    },
    defaultVariants: {
      color: "neutral",
      selected: false,
      interactive: false,
    },
  },
);

type TagProps = Omit<React.ComponentProps<"span">, "color"> &
  VariantProps<typeof tagVariants> & {
    onRemove?: (event: React.MouseEvent<HTMLButtonElement>) => void;
    removeLabel?: string;
  };

function Tag({
  className,
  color,
  selected,
  onClick,
  onRemove,
  removeLabel = "Remove",
  children,
  ...props
}: TagProps) {
  const wrapperClassName = cn(
    tagVariants({ color, selected, interactive: !!onClick }),
    onRemove && "ps-3 pe-1.5",
    className,
  );

  // A native <button> (remove) can't nest inside a role="button" element —
  // when both actions exist, render them as sibling buttons inside a plain,
  // non-interactive wrapper instead of making the whole tag clickable.
  if (onRemove) {
    return (
      <span data-slot="tag" className={wrapperClassName} {...props}>
        {onClick ? (
          <button
            type="button"
            aria-pressed={selected ?? undefined}
            onClick={onClick}
            className="inline-flex items-center gap-1.5"
          >
            {children}
          </button>
        ) : (
          children
        )}
        <button
          type="button"
          aria-label={removeLabel}
          onClick={(event) => {
            event.stopPropagation();
            onRemove(event);
          }}
          className="inline-flex size-4 items-center justify-center rounded-full opacity-60 transition-opacity hover:opacity-100"
        >
          <XIcon className="size-3" />
        </button>
      </span>
    );
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: role/tabIndex/onKeyDown are all applied together whenever onClick is provided, making this a proper keyboard-accessible interactive element
    <span
      data-slot="tag"
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.currentTarget.click();
              }
            }
          : undefined
      }
      className={wrapperClassName}
      {...props}
    >
      {children}
    </span>
  );
}

export { Tag, tagVariants };
