import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

export interface PageHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  metadata?: ReactNode;
  className?: string;
  headingId?: string;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  metadata,
  className,
  headingId,
}: PageHeaderProps) {
  return (
    <header className={cn("flex items-start justify-between gap-8", className)}>
      <div className="min-w-0 max-w-3xl">
        {eyebrow ? (
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.16em] text-primary">
            {eyebrow}
          </p>
        ) : null}
        <h1
          id={headingId}
          className="text-3xl font-extrabold tracking-tight text-foreground"
        >
          {title}
        </h1>
        {description ? (
          <p className="mt-3 text-base leading-7 text-muted-foreground">
            {description}
          </p>
        ) : null}
        {metadata ? <div className="mt-4 flex flex-wrap gap-2">{metadata}</div> : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-3">{actions}</div>
      ) : null}
    </header>
  );
}
