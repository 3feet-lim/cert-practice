import { createContext, useContext } from "react";

import type { WebRuntimeMode } from "../runtime-config";

const RuntimeModeContext = createContext<WebRuntimeMode>("mock");

export const RuntimeModeProvider = RuntimeModeContext.Provider;

/** Distinguishes explicitly configured local mocks from the production HTTP runtime. */
export function useRuntimeMode(): WebRuntimeMode {
  return useContext(RuntimeModeContext);
}
