import { cn } from "../../lib/cn";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover disabled:bg-muted-foreground",
  secondary:
    "border border-border bg-card text-foreground shadow-sm hover:bg-muted disabled:text-muted-foreground",
  danger:
    "bg-danger text-white shadow-sm hover:bg-danger-hover disabled:bg-muted-foreground",
  ghost:
    "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground disabled:text-muted-foreground",
};

export const buttonBaseClassName =
  "inline-flex min-h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus/30 disabled:cursor-not-allowed disabled:opacity-70";

/** Button styling for non-button elements such as router links. */
export function buttonClassName(
  variant: ButtonVariant = "primary",
  className?: string,
) {
  return cn(
    buttonBaseClassName,
    "whitespace-nowrap",
    buttonVariants[variant],
    className,
  );
}
