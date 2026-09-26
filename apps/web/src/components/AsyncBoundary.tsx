import type { ReactNode } from "react";

import { Button } from "./ui/Button";

export type AsyncState<T> =
  | { status: "loading"; label?: string }
  | {
      status: "empty";
      title: string;
      message: string;
      action?: { label: string; onAction: () => void };
    }
  | {
      status: "error";
      title?: string;
      message: string;
      retryable: true;
      retry: { label?: string; onRetry: () => void };
    }
  | {
      status: "error";
      title?: string;
      message: string;
      retryable: false;
      nextAction: { label: string; onAction: () => void };
    }
  | { status: "success"; data: T };

export interface AsyncBoundaryProps<T> {
  state: AsyncState<T>;
  children: (data: T) => ReactNode;
  /** Content such as editable input that must remain mounted across request states. */
  persistentContent?: ReactNode;
}

/** Renders one request state; compose one boundary per request to keep loading independent. */
export function AsyncBoundary<T>({
  state,
  children,
  persistentContent,
}: AsyncBoundaryProps<T>) {
  let requestContent: ReactNode;

  switch (state.status) {
    case "loading":
      requestContent = (
        <div
          className="flex items-center gap-3 rounded-lg border border-border bg-card p-5"
          role="status"
        >
          <span
            aria-hidden="true"
            className="size-5 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary motion-reduce:animate-none"
          />
          <span className="text-sm font-medium text-muted-foreground">
            {state.label ?? "불러오는 중입니다."}
          </span>
        </div>
      );
      break;
    case "empty":
      requestContent = (
        <section
          className="rounded-lg border border-dashed border-border bg-card p-8 text-center"
          aria-labelledby="async-empty-title"
        >
          <h2 id="async-empty-title" className="text-lg font-semibold text-foreground">
            {state.title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {state.message}
          </p>
          {state.action ? (
            <Button className="mt-5" onClick={state.action.onAction}>
              {state.action.label}
            </Button>
          ) : null}
        </section>
      );
      break;
    case "error":
      requestContent = (
        <section
          className="rounded-lg border border-danger/20 bg-danger-soft p-5"
          role="alert"
        >
          <h2 className="font-semibold text-danger">
            {state.title ?? "요청을 완료하지 못했습니다."}
          </h2>
          <p className="mt-1 text-sm leading-6 text-foreground">{state.message}</p>
          {state.retryable ? (
            <Button className="mt-4" variant="secondary" onClick={state.retry.onRetry}>
              {state.retry.label ?? "다시 시도"}
            </Button>
          ) : (
            <Button
              className="mt-4"
              variant="secondary"
              onClick={state.nextAction.onAction}
            >
              {state.nextAction.label}
            </Button>
          )}
        </section>
      );
      break;
    case "success":
      requestContent = children(state.data);
      break;
  }

  return (
    <div className="grid gap-4">
      {persistentContent}
      {requestContent}
    </div>
  );
}
