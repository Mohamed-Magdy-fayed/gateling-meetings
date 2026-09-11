import { StarIcon } from "lucide-react";
import type * as React from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const categoryGradients = {
  orange: "from-orange-300 to-orange-500",
  blue: "from-sky-300 to-sky-500",
  green: "from-mint-300 to-mint-500",
  violet: "from-violet-300 to-violet-500",
} as const;

const categoryBadgeClasses = {
  orange: "bg-orange-50 text-orange-700",
  blue: "bg-sky-50 text-sky-700",
  green: "bg-mint-50 text-mint-700",
  violet: "bg-violet-100 text-violet-600",
} as const;

type CourseCardCategoryColor = keyof typeof categoryGradients;

type CourseCardProps = React.ComponentProps<"div"> & {
  title: React.ReactNode;
  category?: React.ReactNode;
  categoryColor?: CourseCardCategoryColor;
  level?: React.ReactNode;
  cover?: string;
  coverIcon?: React.ReactNode;
  instructor?: string;
  instructorAvatarUrl?: string;
  lessonsLabel?: React.ReactNode;
  durationLabel?: React.ReactNode;
  progress?: number;
  priceLabel?: React.ReactNode;
  rating?: React.ReactNode;
};

function CourseCard({
  className,
  title,
  category,
  categoryColor = "orange",
  level,
  cover,
  coverIcon,
  instructor,
  instructorAvatarUrl,
  lessonsLabel,
  durationLabel,
  progress,
  priceLabel,
  rating,
  onClick,
  ...props
}: CourseCardProps) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: role/tabIndex/onKeyDown are all applied together whenever onClick is provided, making this a proper keyboard-accessible interactive element
    <div
      data-slot="course-card"
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
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border bg-card shadow-sm transition-all ease-out",
        onClick && "cursor-pointer hover:-translate-y-1 hover:shadow-lg",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "relative flex h-[132px] items-center justify-center bg-cover bg-center text-4xl",
          !cover && "bg-gradient-to-br",
          !cover && categoryGradients[categoryColor],
        )}
        style={cover ? { backgroundImage: `url(${cover})` } : undefined}
      >
        {!cover && coverIcon}
        {level && (
          <span className="absolute top-3 start-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-extrabold text-foreground">
            {level}
          </span>
        )}
        {priceLabel != null && (
          <span className="absolute top-3 end-3 rounded-full bg-card px-3 py-1 text-sm font-extrabold text-primary shadow-sm">
            {priceLabel}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-5">
        <div className="flex items-center gap-2">
          {category && (
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-extrabold",
                categoryBadgeClasses[categoryColor],
              )}
            >
              {category}
            </span>
          )}
          {rating != null && (
            <span className="ms-auto inline-flex items-center gap-1 text-xs font-bold text-muted-foreground">
              <StarIcon className="size-3.5 fill-current" />
              {rating}
            </span>
          )}
        </div>
        <h4 className="font-display text-base font-semibold leading-snug text-foreground">
          {title}
        </h4>
        {(lessonsLabel != null || durationLabel) && (
          <div className="flex gap-3.5 text-sm font-semibold text-muted-foreground">
            {lessonsLabel != null && <span>{lessonsLabel}</span>}
            {durationLabel && <span>{durationLabel}</span>}
          </div>
        )}
        {progress != null && <Progress value={progress} className="h-1.5" />}
        {instructor && (
          <div className="mt-auto flex items-center gap-2 pt-1.5">
            <Avatar className="size-[26px]">
              <AvatarImage src={instructorAvatarUrl} alt={instructor} />
              <AvatarFallback className="text-[10px]">
                {instructor.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-semibold text-muted-foreground">
              {instructor}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export { CourseCard };
