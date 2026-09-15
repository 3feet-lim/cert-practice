import { createContext, useContext } from "react";

import type { BrowserAuthSession } from "../auth/cognito-pkce-session";

const BrowserAuthSessionContext = createContext<BrowserAuthSession | undefined>(undefined);

export const BrowserAuthSessionProvider = BrowserAuthSessionContext.Provider;

/** Available only for the real browser HTTP runtime. */
export function useBrowserAuthSession(): BrowserAuthSession | undefined {
  return useContext(BrowserAuthSessionContext);
}
