import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

export interface StaticDialogProps {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  open?: boolean;
  className?: string;
}

/** Always-deterministic dialog presentation for static review fixtures. */
export function StaticDialog({
  id,
  title,
  description,
  children,
  actions,
  open = true,
  className,
}: StaticDialogProps) {
  if (!open) return null;

  const titleId = `${id}-title`;
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <div
      className="relative rounded-2xl bg-foreground/45 p-8"
      data-static-dialog-overlay="true"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={cn(
          "mx-auto grid w-full max-w-lg gap-5 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-dialog",
          className,
        )}
      >
        <header>
          <h2
            id={titleId}
            className="text-xl font-extrabold tracking-tight text-foreground"
          >
            {title}
          </h2>
          {description ? (
            <p
              id={descriptionId}
              className="mt-2 text-sm leading-6 text-muted-foreground"
            >
              {description}
            </p>
          ) : null}
        </header>
        <div>{children}</div>
        {actions ? (
          <footer className="flex flex-wrap justify-end gap-3 border-t border-border pt-5">
            {actions}
          </footer>
        ) : null}
      </section>
    </div>
  );
}
