import {
  createMockAuthController,
  createMockCertQuizApi,
  type MockAuthActor,
} from "./api/mock-adapter";
import type { WebRuntime } from "./runtime-config";

export interface CreateMockWebRuntimeOptions {
  readonly mockActor?: string | null;
  readonly mockScenario?: string | null;
}

function isMockActor(value: string | null | undefined): value is MockAuthActor {
  return (
    value === "approved" ||
    value === "admin" ||
    value === "pending" ||
    value === "unauthenticated"
  );
}

/** Creates mock dependencies for an explicitly resolved non-production mock mode. */
export function createMockWebRuntime(
  options: CreateMockWebRuntimeOptions = {},
): WebRuntime {
  const authController = createMockAuthController(
    isMockActor(options.mockActor) ? options.mockActor : "unauthenticated",
  );
  const mockScenario = options.mockScenario;
  return {
    api: createMockCertQuizApi({
      authController,
      e2eScenario:
        mockScenario === "completed-results" ||
        mockScenario === "catalog-loading" ||
        mockScenario === "catalog-empty" ||
        mockScenario === "catalog-retry-once"
          ? mockScenario
          : undefined,
    }),
    authCallbackCapability: authController,
  };
}
