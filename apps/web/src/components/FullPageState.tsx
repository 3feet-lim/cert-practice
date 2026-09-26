import type { ReactNode } from "react";

import { cn } from "../lib/cn";

export interface FullPageStateProps {
  title?: string;
  eyebrow?: string;
  titleId?: string;
  children: ReactNode;
  busy?: boolean;
  className?: string;
  /** Extra attributes for the card, e.g. data markers used by tests. */
  cardProps?: Record<`data-${string}`, string>;
}

/**
 * Centered, token-styled card for route-level loading, error, and not-found states
 * rendered outside the authenticated layout.
 */
export function FullPageState({
  title,
  eyebrow,
  titleId,
  children,
  busy,
  className,
  cardProps,
}: FullPageStateProps) {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-8 text-foreground sm:px-8">
      <section
        aria-busy={busy || undefined}
        aria-labelledby={title ? titleId : undefined}
        className={cn(
          "w-full max-w-xl rounded-2xl border border-border bg-card p-8 shadow-card sm:p-10",
          className,
        )}
        {...cardProps}
      >
        <div
          aria-hidden="true"
          className="mb-6 grid size-11 place-items-center rounded-xl bg-primary text-sm font-black text-primary-foreground"
        >
          CF
        </div>
        {eyebrow ? (
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.16em] text-primary">
            {eyebrow}
          </p>
        ) : null}
        {title ? (
          <h1 id={titleId} className="text-2xl font-bold tracking-tight sm:text-3xl">
            {title}
          </h1>
        ) : null}
        <div className={cn(title && "mt-4")}>{children}</div>
      </section>
    </main>
  );
}

/** Spinner + message used for route-level loading states. */
export function LoadingMessage({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="flex items-center gap-3 text-muted-foreground">
      <span
        aria-hidden="true"
        className="size-5 shrink-0 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary motion-reduce:animate-none"
      />
      {children}
    </p>
  );
}
