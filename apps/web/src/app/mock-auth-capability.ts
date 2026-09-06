import { createContext, useContext } from "react";

/**
 * Runtime-only capability for completing the deterministic mock login callback.
 * It is injected at the composition root so route components never import mock
 * adapters or MSW internals.
 */
export interface MockAuthCallbackCapability {
  completeMockLogin(): void;
}

const MockAuthCallbackContext = createContext<MockAuthCallbackCapability | undefined>(
  undefined,
);

export const MockAuthCallbackProvider = MockAuthCallbackContext.Provider;

export function useMockAuthCallback(): MockAuthCallbackCapability | undefined {
  return useContext(MockAuthCallbackContext);
}
