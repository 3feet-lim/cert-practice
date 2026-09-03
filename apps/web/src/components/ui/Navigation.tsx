import type { HTMLAttributes } from "react";

import { cn } from "../../lib/cn";

export interface NavigationItem {
  href?: string;
  label: string;
  description?: string;
  current?: boolean;
  disabled?: boolean;
}

export interface NavigationProps extends HTMLAttributes<HTMLElement> {
  items: NavigationItem[];
  label: string;
  orientation?: "horizontal" | "vertical";
}

/** Props-only navigation that accepts route or exported-HTML relative hrefs. */
export function Navigation({
  items,
  label,
  orientation = "vertical",
  className,
  ...props
}: NavigationProps) {
  return (
    <nav aria-label={label} className={className} {...props}>
      <ul
        className={cn(
          "flex list-none p-0",
          orientation === "horizontal" ? "items-center gap-1" : "flex-col gap-1",
        )}
      >
        {items.map((item) => {
          const content = (
            <>
              <span className="font-semibold">{item.label}</span>
              {item.description ? (
                <span className="text-xs leading-5 text-muted-foreground">
                  {item.description}
                </span>
              ) : null}
            </>
          );
          const classes = cn(
            "flex rounded-md px-3 py-2 text-sm transition-colors",
            item.description ? "flex-col items-start" : "items-center",
            item.current
              ? "bg-primary-soft text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus/30",
            item.disabled && "cursor-not-allowed opacity-50",
          );

          return (
            <li key={`${item.label}:${item.href ?? "disabled"}`}>
              {item.disabled || !item.href ? (
                <span className={classes} aria-disabled="true">
                  {content}
                </span>
              ) : (
                <a
                  className={classes}
                  href={item.href}
                  aria-current={item.current ? "page" : undefined}
                >
                  {content}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
