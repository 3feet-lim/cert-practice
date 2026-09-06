import { CertQuizRequestError } from "../api/query-result";
import type { AsyncState } from "./AsyncBoundary";

/**
 * The common subset exposed by TanStack Query and mutation results that is
 * needed to render an AsyncBoundary. Keeping this structural avoids coupling
 * presentational components to a particular request library.
 */
export type AsyncRequestSource<T> = {
  isPending: boolean;
  isError: boolean;
  data: T | undefined;
  error: unknown;
};

type AsyncBoundaryAction = {
  label: string;
  onAction: () => void;
};

type AsyncBoundaryRetry = {
  label?: string;
  onRetry: () => void;
};

export type AsyncBoundaryStateOptions<T> = {
  loadingLabel?: string;
  isEmpty?: (data: T) => boolean;
  empty?: {
    title: string;
    message: string;
    action?: AsyncBoundaryAction;
  };
  /** Required so non-retryable transport errors always offer a distinct next step. */
  nextAction: AsyncBoundaryAction;
  /** Mutations supply their canonical re-submit closure; queries derive this from refetch. */
  retry: AsyncBoundaryRetry;
};

function errorState<T>(
  error: unknown,
  options: Pick<AsyncBoundaryStateOptions<T>, "nextAction" | "retry">,
): AsyncState<T> {
  if (error instanceof CertQuizRequestError) {
    const { detail } = error;
    if (detail.retryable) {
      return {
        status: "error",
        title: detail.code,
        message: detail.message,
        retryable: true,
        retry: options.retry,
      };
    }

    return {
      status: "error",
      title: detail.code,
      message: detail.message,
      retryable: false,
      nextAction: {
        ...options.nextAction,
        label: detail.nextAction ?? options.nextAction.label,
      },
    };
  }

  return {
    status: "error",
    message: error instanceof Error ? error.message : "요청을 완료하지 못했습니다.",
    retryable: true,
    retry: options.retry,
  };
}

/**
 * Maps a Query or mutation result to AsyncBoundary's explicit request-state
 * union. The request source stays independent from persistent local input.
 */
export function toAsyncBoundaryState<T>(
  source: AsyncRequestSource<T>,
  options: AsyncBoundaryStateOptions<T>,
): AsyncState<T> {
  if (source.isPending) {
    return { status: "loading", label: options.loadingLabel };
  }

  if (source.isError) {
    return errorState(source.error, options);
  }

  if (source.data === undefined) {
    return { status: "loading", label: options.loadingLabel };
  }

  if (options.isEmpty?.(source.data)) {
    if (!options.empty) {
      throw new Error("An empty AsyncBoundary state requires empty presentation copy.");
    }
    return { status: "empty", ...options.empty };
  }

  return { status: "success", data: source.data };
}

export type AsyncQuerySource<T> = AsyncRequestSource<T> & {
  refetch: () => unknown;
};

export type AsyncQueryBoundaryOptions<T> = Omit<AsyncBoundaryStateOptions<T>, "retry">;

/** Uses the query's own refetch operation only for retryable failures. */
export function toQueryAsyncBoundaryState<T>(
  source: AsyncQuerySource<T>,
  options: AsyncQueryBoundaryOptions<T>,
): AsyncState<T> {
  return toAsyncBoundaryState(source, {
    ...options,
    retry: { onRetry: () => void source.refetch() },
  });
}

/**
 * Mutations receive an explicit retry closure so callers can replay their
 * canonical variables without guessing or reading transient input state.
 */
export function toMutationAsyncBoundaryState<T>(
  source: AsyncRequestSource<T>,
  options: AsyncBoundaryStateOptions<T>,
): AsyncState<T> {
  return toAsyncBoundaryState(source, options);
}
