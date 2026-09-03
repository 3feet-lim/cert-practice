import { useId, type ReactNode } from "react";

import { cn } from "../../lib/cn";

export type StatePanelStatus = "loading" | "empty" | "error" | "success";

export interface StatePanelProps {
  status: StatePanelStatus;
  title: string;
  message: string;
  action?: ReactNode;
  details?: ReactNode;
  className?: string;
}

const statusClasses: Record<StatePanelStatus, string> = {
  loading: "border-border bg-card",
  empty: "border-dashed border-border bg-card",
  error: "border-danger/20 bg-danger-soft",
  success: "border-success/20 bg-success-soft",
};

const markerClasses: Record<StatePanelStatus, string> = {
  loading: "border-muted-foreground/25 border-t-primary",
  empty: "border-border bg-muted",
  error: "border-danger/20 bg-danger",
  success: "border-success/20 bg-success",
};

/** Static request-state surface. Actions are supplied as markup; no request logic is owned here. */
export function StatePanel({
  status,
  title,
  message,
  action,
  details,
  className,
}: StatePanelProps) {
  const titleId = useId();
  const role = status === "error" ? "alert" : "status";

  return (
    <section
      aria-labelledby={titleId}
      aria-busy={status === "loading" ? true : undefined}
      role={role}
      className={cn("rounded-xl border p-6", statusClasses[status], className)}
      data-state={status}
    >
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className={cn(
            "mt-0.5 size-6 shrink-0 rounded-full border-2",
            markerClasses[status],
            status === "loading" && "animate-spin motion-reduce:animate-none",
          )}
        />
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="font-bold text-foreground">
            {title}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{message}</p>
          {details ? <div className="mt-3 text-sm text-foreground">{details}</div> : null}
          {action ? <div className="mt-5 flex flex-wrap gap-3">{action}</div> : null}
        </div>
      </div>
    </section>
  );
}
