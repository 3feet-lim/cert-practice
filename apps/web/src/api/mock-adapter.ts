import {
  healthDtoSchema,
  type ApprovalStatusDto,
  type CurrentUserDto,
  type HealthDto,
  type ResponseMeta,
} from "@cert-quiz/contracts";

import { createCertQuizFixtures } from "../mocks/fixtures";
import { HEALTH_FIXTURE } from "../mocks/health-fixture";
import type { CertQuizApi, CertQuizApiResult } from "./port";
import { createUnavailableCertQuizApi } from "./unavailable-adapter";

export const MOCK_HEALTH_FIXTURE = HEALTH_FIXTURE;

const FIXTURES = createCertQuizFixtures();

export type MockAuthActor = keyof typeof FIXTURES.auth;

export interface MockCertQuizApiOptions {
  healthPayload?: unknown;
  authActor?: MockAuthActor;
}

function authenticationFailure<Output>(): CertQuizApiResult<Output> {
  return {
    ok: false,
    error: {
      code: "authentication-invalid",
      message: "Authentication is required.",
      requestId: "mock:auth:unauthenticated",
      retryable: false,
      nextAction: "Sign in with Google.",
    },
  };
}

/**
 * Frontend-only adapter used by the bootstrap and route screens. It validates
 * deterministic fixture data and performs no HTTP, Hono, Cognito, or AWS work.
 */
export function createMockCertQuizApi(
  options: MockCertQuizApiOptions = {},
): CertQuizApi {
  const fallback = createUnavailableCertQuizApi();
  const healthPayload = options.healthPayload ?? MOCK_HEALTH_FIXTURE;
  const authActor = options.authActor ?? "approved";

  return {
    ...fallback,
    getHealth: async (): Promise<CertQuizApiResult<HealthDto>> => {
      const parsed = healthDtoSchema.safeParse(healthPayload);

      if (!parsed.success) {
        return {
          ok: false,
          error: {
            code: "internal-error",
            message: "The bootstrap health response failed schema validation.",
            requestId: "mock:health:invalid-contract",
            retryable: false,
            nextAction: "Check the mock fixture against the shared health contract.",
          },
        };
      }

      const meta: ResponseMeta = { requestId: "mock:health" };
      return { ok: true, data: parsed.data, meta };
    },
    getApprovalStatus: async (): Promise<CertQuizApiResult<ApprovalStatusDto>> => {
      if (authActor === "unauthenticated") {
        return authenticationFailure();
      }

      return {
        ok: true,
        data: FIXTURES.auth[authActor].approval,
        meta: { requestId: `mock:auth:${authActor}:approval` },
      };
    },
    getCurrentUser: async (): Promise<CertQuizApiResult<CurrentUserDto>> => {
      if (authActor === "unauthenticated") {
        return authenticationFailure();
      }
      if (authActor === "pending") {
        return {
          ok: false,
          error: {
            code: "approval-required",
            message: "Account approval is required.",
            requestId: "mock:auth:pending",
            retryable: false,
            nextAction: "Wait for administrator approval.",
          },
        };
      }

      return {
        ok: true,
        data: FIXTURES.auth[authActor].user,
        meta: { requestId: `mock:auth:${authActor}:current-user` },
      };
    },
  };
}
