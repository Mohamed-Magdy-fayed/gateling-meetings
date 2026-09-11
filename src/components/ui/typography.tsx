import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function H1({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h1
      className={cn(
        "scroll-m-20 text-balance font-bold text-4xl tracking-tight lg:text-5xl",
        className,
      )}
      {...props}
    >
      {children}
    </h1>
  );
}

export function H2({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn(
        "scroll-m-20 border-b pb-2 font-semibold text-3xl tracking-tight first:mt-0",
        className,
      )}
      {...props}
    >
      {children}
    </h2>
  );
}

export function H3({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "scroll-m-20 font-semibold text-2xl tracking-tight",
        className,
      )}
      {...props}
    >
      {children}
    </h3>
  );
}

export function H4({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h4
      className={cn(
        "scroll-m-20 font-semibold text-xl tracking-tight",
        className,
      )}
      {...props}
    >
      {children}
    </h4>
  );
}

export function P({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("leading-7", className)} {...props}>
      {children}
    </p>
  );
}

export function Blockquote({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <blockquote
      className={cn("mt-6 border-s-2 ps-6 italic", className)}
      {...props}
    >
      {children}
    </blockquote>
  );
}

export function InlineCode({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <code
      className={cn(
        "relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono font-semibold text-sm",
        className,
      )}
      {...props}
    >
      {children}
    </code>
  );
}

export function Lead({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-muted-foreground text-xl", className)} {...props}>
      {children}
    </p>
  );
}

export function Large({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("font-semibold text-lg", className)} {...props}>
      {children}
    </div>
  );
}

export function Small({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <small
      className={cn("font-medium text-sm leading-none", className)}
      {...props}
    >
      {children}
    </small>
  );
}

export function Muted({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-muted-foreground text-sm", className)} {...props}>
      {children}
    </p>
  );
}
