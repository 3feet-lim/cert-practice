import { type PropsWithChildren, useState } from "react";

import { createQuizStore, type QuizStoreApi, QuizStoreContext } from "./quiz-store";

export type QuizStoreProviderProps = PropsWithChildren<{ store?: QuizStoreApi }>;

/** Owns one transient store for each composition-root mount. */
export function QuizStoreProvider({ store, children }: QuizStoreProviderProps) {
  const [resolvedStore] = useState(() => store ?? createQuizStore());

  return (
    <QuizStoreContext.Provider value={resolvedStore}>
      {children}
    </QuizStoreContext.Provider>
  );
}
