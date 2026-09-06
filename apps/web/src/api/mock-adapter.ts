import {
  healthDtoSchema,
  type ActivePracticeSessionsDto,
  type ApprovalStatusDto,
  type ApproveUserResponse,
  type CatalogDto,
  type CommitImportResponse,
  type CurrentUserDto,
  type DryRunImportResponse,
  type ExamResultDto,
  type ExamStateResponse,
  type GetExamResponse,
  type HealthDto,
  type HistoryPageDto,
  type HistoryTrendsDto,
  type LeaderboardDto,
  type PendingUsersDto,
  type PracticeResultDto,
  type PracticeSessionDto,
  type PracticeStateResponse,
  type ResponseMeta,
  type StartExamResponse,
  type StartPracticeResponse,
  type SubmissionPreviewDto,
  type SubmitExamResponse,
  type SubmitPracticeQuestionResponse,
  type UpdateScoreVisibilityResponse,
  type Uuid,
} from "@cert-quiz/contracts";

import { createCertQuizFixtures } from "../mocks/fixtures";
import {
  createCertQuizMockStateMachine,
  MockStateError,
  MOCK_IDS,
  type CertQuizMockStateMachine,
} from "../mocks/state-machine";
import { HEALTH_FIXTURE } from "../mocks/health-fixture";
import type { CertQuizApi, CertQuizApiResult } from "./port";
import { createUnavailableCertQuizApi } from "./unavailable-adapter";

export const MOCK_HEALTH_FIXTURE = HEALTH_FIXTURE;

const FIXTURES = createCertQuizFixtures();

export type MockAuthActor = keyof typeof FIXTURES.auth;
export type MockCatalogFixture = keyof typeof FIXTURES.catalog;

export interface MockAuthController {
  getActor(): MockAuthActor;
  completeMockLogin(): void;
  approve(): void;
}

export function createMockAuthController(
  initialActor: MockAuthActor = "unauthenticated",
): MockAuthController {
  let actor = initialActor;

  return {
    getActor: () => actor,
    completeMockLogin: () => {
      actor = "pending";
    },
    approve: () => {
      if (actor === "pending") actor = "approved";
    },
  };
}

export interface MockCertQuizApiOptions {
  healthPayload?: unknown;
  authActor?: MockAuthActor;
  authController?: MockAuthController;
  catalog?: MockCatalogFixture;
  importState?: CertQuizMockStateMachine;
  examState?: CertQuizMockStateMachine;
  /** Deterministic server-time source for the practice-result retention boundary. */
  now?: () => Date;
  /** Browser-test fixture state only; it is not a backend acceptance mode. */
  e2eScenario?:
    "completed-results" | "catalog-loading" | "catalog-empty" | "catalog-retry-once";
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

function authorizationFailure<Output>(
  authActor: MockAuthActor,
): CertQuizApiResult<Output> | undefined {
  if (authActor === "unauthenticated") return authenticationFailure();
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
  return undefined;
}

function adminAuthorizationFailure<Output>(
  authActor: MockAuthActor,
): CertQuizApiResult<Output> | undefined {
  const failure = authorizationFailure<Output>(authActor);
  if (failure) return failure;
  if (authActor !== "admin") {
    return {
      ok: false,
      error: {
        code: "admin-required",
        message: "Administrator access is required.",
        requestId: "mock:admin:role-required",
        retryable: false,
        nextAction: "Return to an approved route.",
      },
    };
  }
  return undefined;
}

function approvedActor(authActor: MockAuthActor): "approved" | "admin" | undefined {
  return authActor === "approved" || authActor === "admin" ? authActor : undefined;
}

/**
 * Frontend-only adapter used by bootstrap and route screens. It validates
 * deterministic fixture data and performs no HTTP, Hono, Cognito, or AWS work.
 */
export function createMockCertQuizApi(
  options: MockCertQuizApiOptions = {},
): CertQuizApi {
  const fallback = createUnavailableCertQuizApi();
  const healthPayload = options.healthPayload ?? MOCK_HEALTH_FIXTURE;
  const authController =
    options.authController ?? createMockAuthController(options.authActor ?? "approved");
  const catalog =
    options.e2eScenario === "catalog-empty" ? "empty" : (options.catalog ?? "valid");
  const getAuthActor = () => authController.getActor();
  const now = options.now ?? (() => FIXTURES.clock.now());
  let catalogRequestCount = 0;
  const currentUsers = new Map<"approved" | "admin", CurrentUserDto>([
    ["approved", structuredClone(FIXTURES.auth.approved.user)],
    ["admin", structuredClone(FIXTURES.auth.admin.user)],
  ]);
  const currentUserFor = (actor: "approved" | "admin") => {
    const user = currentUsers.get(actor);
    if (!user) throw new Error(`Missing mock current user for ${actor}.`);
    return user;
  };
  const completedPracticeSession: PracticeSessionDto = {
    ...FIXTURES.practice.active,
    questions: FIXTURES.practice.immutableResult.questions.map((question) => ({
      ...question,
      kind: "practice-submitted" as const,
    })),
  };
  let currentPractice: {
    session: PracticeSessionDto;
    summary: ActivePracticeSessionsDto["sessions"][number];
  } = {
    session:
      options.e2eScenario === "completed-results"
        ? completedPracticeSession
        : structuredClone(FIXTURES.practice.active),
    summary: structuredClone(FIXTURES.practice.activeSummary),
  };
  const reviewByQuestionId = new Map(
    FIXTURES.practice.immutableResult.questions.map((question) => [
      question.id,
      question,
    ]),
  );
  const practiceSummary = (session: PracticeSessionDto) => ({
    ...currentPractice.summary,
    practiceSessionId: session.practiceSessionId,
    currentQuestionNumber: session.questions[session.currentIndex]?.displayNumber ?? 1,
    stateVersion: session.stateVersion,
  });
  const sameSelection = (left: readonly Uuid[], right: readonly Uuid[]) =>
    left.length === right.length && left.every((choiceId) => right.includes(choiceId));
  let pendingUsers = [...FIXTURES.admin.pendingUsers.users];
  const approvedPendingUserIds = new Set<Uuid>();
  const importState = options.importState ?? createCertQuizMockStateMachine();
  const examState = options.examState ?? createCertQuizMockStateMachine();
  // The deterministic exam state is owned by the state-machine fixture user.
  const examActorId = () => MOCK_IDS.user;
  const importActorId = () =>
    getAuthActor() === "admin"
      ? FIXTURES.auth.admin.user.id
      : FIXTURES.auth.approved.user.id;

  const importFailure = <Output>(error: MockStateError): CertQuizApiResult<Output> => ({
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      requestId: `mock:admin:import:${error.code}`,
      retryable: false,
      nextAction:
        error.code === "content-changed" ||
        error.code === "token-used" ||
        error.code === "validation-expired" ||
        error.code === "validation-required"
          ? "Validate the selected file again before committing."
          : "Correct the import and try again.",
    },
  });

  const practiceFailure = <Output>(
    error: MockStateError,
  ): CertQuizApiResult<Output> => ({
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
      requestId: `mock:practice:${error.code}`,
      retryable: false,
      nextAction:
        error.code === "stale-version"
          ? "Refresh the latest practice state and try again."
          : "Review the current practice state and try again.",
    },
  });

  const examFailure = <Output>(error: MockStateError): CertQuizApiResult<Output> => ({
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
      requestId: `mock:exam:${error.code}`,
      retryable: false,
      nextAction:
        error.code === "exam-expired"
          ? "Submit the exam to view the server-generated result."
          : "Refresh the exam and try again.",
    },
  });

  const notFoundFailure = <Output>(): CertQuizApiResult<Output> => ({
    ok: false,
    error: {
      code: "not-found",
      message: "The requested practice session does not exist.",
      requestId: "mock:practice:not-found",
      retryable: false,
      nextAction: "Return to the certification catalog and choose a practice session.",
    },
  });

  const expiredPracticeResultFailure = <Output>(): CertQuizApiResult<Output> => ({
    ok: false,
    error: {
      code: "practice-result-expired",
      message: "This practice result is no longer available after 168 hours.",
      requestId: "mock:practice:result-expired",
      retryable: false,
      nextAction: "Start a new practice session to receive a new review window.",
    },
  });

  const staleVisibilityFailure = <Output>(): CertQuizApiResult<Output> => ({
    ok: false,
    error: {
      code: "stale-version",
      message: "The score visibility setting changed before it could be saved.",
      requestId: "mock:profile:visibility-stale-version",
      retryable: false,
      nextAction: "Refresh the current profile and try again.",
    },
  });

  const leaderboardNotFoundFailure = <Output>(): CertQuizApiResult<Output> => ({
    ok: false,
    error: {
      code: "not-found",
      message: "The requested certification leaderboard does not exist.",
      requestId: "mock:leaderboard:not-found",
      retryable: false,
      nextAction: "Choose a certification from the catalog.",
    },
  });

  const invalidReplacementConfirmation = <Output>(): CertQuizApiResult<Output> => ({
    ok: false,
    error: {
      code: "validation-failed",
      message: "A replacement confirmation nonce is required.",
      requestId: "mock:practice:replacement-confirmation-required",
      retryable: false,
      nextAction: "Confirm replacing the active practice session and try again.",
    },
  });

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
    getPendingUsers: async (): Promise<CertQuizApiResult<PendingUsersDto>> => {
      const failure = adminAuthorizationFailure<PendingUsersDto>(getAuthActor());
      if (failure) return failure;
      return {
        ok: true,
        data: { users: pendingUsers },
        meta: { requestId: "mock:admin:pending-users" },
      };
    },
    approveUser: async ({
      userId,
    }): Promise<CertQuizApiResult<ApproveUserResponse>> => {
      const failure = adminAuthorizationFailure<ApproveUserResponse>(getAuthActor());
      if (failure) return failure;
      const pendingIndex = pendingUsers.findIndex((user) => user.id === userId);
      if (pendingIndex === -1 && !approvedPendingUserIds.has(userId)) {
        return {
          ok: false,
          error: {
            code: "not-found",
            message: "The requested pending user does not exist.",
            requestId: "mock:admin:pending-user:not-found",
            retryable: false,
            nextAction: "Refresh the pending user list and try again.",
          },
        };
      }
      if (pendingIndex !== -1) {
        pendingUsers = pendingUsers.filter((user) => user.id !== userId);
        approvedPendingUserIds.add(userId);
      }
      return {
        ok: true,
        data: { userId, approvalStatus: "approved" },
        meta: { requestId: "mock:admin:approve-user" },
      };
    },
    dryRunImport: async ({ content }) => {
      const failure = adminAuthorizationFailure<DryRunImportResponse>(getAuthActor());
      if (failure) return failure;
      try {
        return {
          ok: true,
          data: importState.createImportValidation(content, importActorId()),
          meta: { requestId: "mock:admin:import:dry-run" },
        };
      } catch (error) {
        if (error instanceof MockStateError) return importFailure(error);
        throw error;
      }
    },
    commitImport: async (request) => {
      const failure = adminAuthorizationFailure<CommitImportResponse>(getAuthActor());
      if (failure) return failure;
      try {
        return {
          ok: true,
          data: importState.commitImport(request, importActorId()),
          meta: { requestId: "mock:admin:import:commit" },
        };
      } catch (error) {
        if (error instanceof MockStateError) return importFailure(error);
        throw error;
      }
    },
    getApprovalStatus: async (): Promise<CertQuizApiResult<ApprovalStatusDto>> => {
      const authActor = getAuthActor();
      if (authActor === "unauthenticated") {
        return authenticationFailure();
      }

      return {
        ok: true,
        data: FIXTURES.auth[authActor].approval,
        meta: { requestId: `mock:auth:${authActor}:approval` },
      };
    },
    getCatalog: async (): Promise<CertQuizApiResult<CatalogDto>> => {
      const failure = authorizationFailure<CatalogDto>(getAuthActor());
      if (failure) return failure;
      if (options.e2eScenario === "catalog-loading") {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 300);
        });
      }
      catalogRequestCount += 1;
      if (options.e2eScenario === "catalog-retry-once" && catalogRequestCount === 1) {
        return {
          ok: false,
          error: {
            code: "dependency-unavailable",
            message: "The mock catalog is temporarily unavailable.",
            requestId: "mock:e2e:catalog-retry-once",
            retryable: true,
            nextAction: "Retry the catalog request.",
          },
        };
      }
      return {
        ok: true,
        data: FIXTURES.catalog[catalog],
        meta: { requestId: `mock:catalog:${catalog}` },
      };
    },
    listActivePracticeSessions: async (): Promise<
      CertQuizApiResult<ActivePracticeSessionsDto>
    > => {
      const failure = authorizationFailure<ActivePracticeSessionsDto>(getAuthActor());
      if (failure) return failure;
      return {
        ok: true,
        data: { sessions: [currentPractice.summary] },
        meta: { requestId: "mock:practice:active" },
      };
    },
    startPractice: async (): Promise<CertQuizApiResult<StartPracticeResponse>> => {
      const failure = authorizationFailure<StartPracticeResponse>(getAuthActor());
      if (failure) return failure;
      return {
        ok: true as const,
        data: {
          kind: "resume-or-replace-required" as const,
          session: currentPractice.summary,
          allowedActions: ["resume", "replace"] as ["resume", "replace"],
        },
        meta: { requestId: "mock:practice:start:active" },
      };
    },
    resumePractice: async ({
      practiceSessionId,
    }): Promise<CertQuizApiResult<PracticeSessionDto>> => {
      const failure = authorizationFailure<PracticeSessionDto>(getAuthActor());
      if (failure) return failure;
      if (practiceSessionId !== currentPractice.session.practiceSessionId) {
        return notFoundFailure();
      }
      return {
        ok: true,
        data: currentPractice.session,
        meta: { requestId: "mock:practice:resume" },
      };
    },
    replacePractice: async ({
      practiceSessionId,
      confirmationNonce,
    }): Promise<CertQuizApiResult<PracticeSessionDto>> => {
      const failure = authorizationFailure<PracticeSessionDto>(getAuthActor());
      if (failure) return failure;
      if (confirmationNonce.length === 0) return invalidReplacementConfirmation();
      if (practiceSessionId !== currentPractice.session.practiceSessionId) {
        return notFoundFailure();
      }
      const session = structuredClone(FIXTURES.practice.replacement);
      currentPractice = {
        session,
        summary: practiceSummary(session),
      };
      return {
        ok: true,
        data: session,
        meta: { requestId: "mock:practice:replace" },
      };
    },
    patchPracticeState: async ({
      practiceSessionId,
      expectedVersion,
      answer,
      flag,
      currentIndex,
    }) => {
      const failure = authorizationFailure<PracticeStateResponse>(getAuthActor());
      if (failure) return failure;
      const session = currentPractice.session;
      if (practiceSessionId !== session.practiceSessionId) return notFoundFailure();
      if (expectedVersion !== session.stateVersion) {
        return practiceFailure(
          new MockStateError(
            "stale-version",
            "Refresh the latest state before saving again.",
          ),
        );
      }
      if (
        currentIndex !== undefined &&
        (currentIndex < 0 || currentIndex >= session.questions.length)
      ) {
        return practiceFailure(
          new MockStateError("validation-failed", "Current position is invalid."),
        );
      }

      const updateQuestion = (
        question: PracticeSessionDto["questions"][number],
      ): PracticeSessionDto["questions"][number] => {
        if (answer?.questionId === question.id) {
          if (question.kind === "practice-submitted") {
            throw new MockStateError(
              "answer-locked",
              "The submitted practice answer cannot be changed.",
            );
          }
          if (
            answer.selectedChoiceIds.some(
              (choiceId) => !question.choices.some(({ id }) => id === choiceId),
            )
          ) {
            throw new MockStateError(
              "validation-failed",
              "A selected choice does not belong to this question.",
            );
          }
          return { ...question, selectedChoiceIds: [...answer.selectedChoiceIds] };
        }
        if (flag?.questionId === question.id) {
          return { ...question, flagged: flag.flagged };
        }
        return question;
      };

      try {
        if (
          (answer && !session.questions.some(({ id }) => id === answer.questionId)) ||
          (flag && !session.questions.some(({ id }) => id === flag.questionId))
        ) {
          throw new MockStateError("not-found", "Practice question was not found.");
        }
        const nextSession: PracticeSessionDto = {
          ...session,
          stateVersion: session.stateVersion + 1,
          currentIndex: currentIndex ?? session.currentIndex,
          questions: session.questions.map(updateQuestion),
        };
        currentPractice = {
          session: nextSession,
          summary: practiceSummary(nextSession),
        };
        return {
          ok: true as const,
          data: {
            practiceSessionId: nextSession.practiceSessionId,
            stateVersion: nextSession.stateVersion,
            currentIndex: nextSession.currentIndex,
          },
          meta: { requestId: "mock:practice:patch" },
        };
      } catch (error) {
        if (error instanceof MockStateError) return practiceFailure(error);
        throw error;
      }
    },
    submitPracticeQuestion: async ({
      practiceSessionId,
      questionId,
      expectedVersion,
      selectedChoiceIds,
    }) => {
      const failure =
        authorizationFailure<SubmitPracticeQuestionResponse>(getAuthActor());
      if (failure) return failure;
      const session = currentPractice.session;
      if (practiceSessionId !== session.practiceSessionId) return notFoundFailure();
      const question = session.questions.find(({ id }) => id === questionId);
      if (!question) {
        return practiceFailure(
          new MockStateError("not-found", "Practice question was not found."),
        );
      }
      if (question.kind === "practice-submitted") {
        if (!sameSelection(question.selectedChoiceIds, selectedChoiceIds)) {
          return practiceFailure(
            new MockStateError(
              "answer-locked",
              "The first submitted answer is already locked.",
            ),
          );
        }
        return {
          ok: true as const,
          data: {
            practiceSessionId,
            stateVersion: session.stateVersion,
            question,
            ...(session.questions.every(
              (candidate) => candidate.kind === "practice-submitted",
            )
              ? {
                  completedPracticeResultId: FIXTURES.practice.immutableResult.resultId,
                }
              : {}),
          },
          meta: { requestId: "mock:practice:submit" },
        };
      }
      if (expectedVersion !== session.stateVersion) {
        return practiceFailure(
          new MockStateError(
            "stale-version",
            "Refresh the latest state before submitting again.",
          ),
        );
      }
      if (
        selectedChoiceIds.some(
          (choiceId) => !question.choices.some(({ id }) => id === choiceId),
        )
      ) {
        return practiceFailure(
          new MockStateError(
            "validation-failed",
            "A selected choice does not belong to this question.",
          ),
        );
      }
      if (selectedChoiceIds.length !== question.requiredChoiceCount) {
        return practiceFailure(
          new MockStateError(
            "invalid-choice-count",
            `Select exactly ${question.requiredChoiceCount} choice(s).`,
          ),
        );
      }

      const review = reviewByQuestionId.get(questionId);
      if (!review) throw new Error("Practice review fixture is missing a question.");
      const isCorrect = sameSelection(selectedChoiceIds, review.correctChoiceIds);
      const submittedQuestion = {
        ...question,
        kind: "practice-submitted" as const,
        selectedChoiceIds: [...selectedChoiceIds],
        correctChoiceIds: [...review.correctChoiceIds],
        isCorrect,
        earnedScore: isCorrect ? ("1" as const) : ("0" as const),
        explanation: review.explanation,
      };
      const nextSession: PracticeSessionDto = {
        ...session,
        stateVersion: session.stateVersion + 1,
        questions: session.questions.map((candidate) =>
          candidate.id === questionId ? submittedQuestion : candidate,
        ),
      };
      const completed = nextSession.questions.every(
        (candidate) => candidate.kind === "practice-submitted",
      );
      currentPractice = {
        session: nextSession,
        summary: practiceSummary(nextSession),
      };
      return {
        ok: true as const,
        data: {
          practiceSessionId,
          stateVersion: nextSession.stateVersion,
          question: submittedQuestion,
          ...(completed
            ? { completedPracticeResultId: FIXTURES.practice.immutableResult.resultId }
            : {}),
        },
        meta: { requestId: "mock:practice:submit" },
      };
    },
    getPracticeResult: async ({ resultId }) => {
      const failure = authorizationFailure<PracticeResultDto>(getAuthActor());
      if (failure) return failure;
      const completed = currentPractice.session.questions.every(
        (question) => question.kind === "practice-submitted",
      );
      const result = FIXTURES.practice.immutableResult;
      const e2eFixtureResult =
        options.e2eScenario === "completed-results" &&
        resultId === MOCK_IDS.practiceResult;
      if (
        (!completed && !e2eFixtureResult) ||
        (resultId !== result.resultId && !e2eFixtureResult)
      ) {
        return notFoundFailure<PracticeResultDto>();
      }
      // Retention is half-open: the result remains available before expiry, but not at it.
      if (now().getTime() >= Date.parse(result.expiresAt)) {
        return expiredPracticeResultFailure<PracticeResultDto>();
      }
      return {
        ok: true as const,
        data: result,
        meta: { requestId: "mock:practice:result" },
      };
    },
    startExam: async (): Promise<CertQuizApiResult<StartExamResponse>> => {
      const failure = authorizationFailure<StartExamResponse>(getAuthActor());
      if (failure) return failure;
      return {
        ok: true as const,
        data: FIXTURES.exam.start,
        meta: { requestId: "mock:exam:start" },
      };
    },
    getExam: async ({ examSessionId }): Promise<CertQuizApiResult<GetExamResponse>> => {
      const failure = authorizationFailure<GetExamResponse>(getAuthActor());
      if (failure) return failure;
      try {
        return {
          ok: true,
          data: examState.getExam(examSessionId, examActorId()),
          meta: { requestId: "mock:exam:get" },
        };
      } catch (error) {
        if (error instanceof MockStateError) return examFailure(error);
        throw error;
      }
    },
    patchExamState: async ({
      examSessionId,
      ...request
    }): Promise<CertQuizApiResult<ExamStateResponse>> => {
      const failure = authorizationFailure<ExamStateResponse>(getAuthActor());
      if (failure) return failure;
      try {
        return {
          ok: true,
          data: examState.patchExam(examSessionId, examActorId(), request),
          meta: { requestId: "mock:exam:patch" },
        };
      } catch (error) {
        if (error instanceof MockStateError) return examFailure(error);
        throw error;
      }
    },
    getExamSubmissionPreview: async ({
      examSessionId,
    }): Promise<CertQuizApiResult<SubmissionPreviewDto>> => {
      const failure = authorizationFailure<SubmissionPreviewDto>(getAuthActor());
      if (failure) return failure;
      try {
        return {
          ok: true,
          data: examState.getExamSubmissionPreview(examSessionId, examActorId()),
          meta: { requestId: "mock:exam:preview" },
        };
      } catch (error) {
        if (error instanceof MockStateError) return examFailure(error);
        throw error;
      }
    },
    submitExam: async ({
      examSessionId,
    }): Promise<CertQuizApiResult<SubmitExamResponse>> => {
      const failure = authorizationFailure<SubmitExamResponse>(getAuthActor());
      if (failure) return failure;
      try {
        return {
          ok: true,
          data: examState.submitExam(examSessionId, examActorId()),
          meta: { requestId: "mock:exam:submit" },
        };
      } catch (error) {
        if (error instanceof MockStateError) return examFailure(error);
        throw error;
      }
    },
    getAttempt: async ({ attemptId }): Promise<CertQuizApiResult<ExamResultDto>> => {
      const failure = authorizationFailure<ExamResultDto>(getAuthActor());
      if (failure) return failure;
      if (
        options.e2eScenario === "completed-results" &&
        attemptId === MOCK_IDS.attempt
      ) {
        return {
          ok: true,
          data: FIXTURES.exam.immutableResult,
          meta: { requestId: "mock:e2e:completed-attempt" },
        };
      }
      try {
        return {
          ok: true,
          data: examState.getAttempt(attemptId, examActorId()),
          meta: { requestId: "mock:exam:attempt" },
        };
      } catch (error) {
        if (error instanceof MockStateError) return examFailure(error);
        throw error;
      }
    },
    getHistory: async (): Promise<CertQuizApiResult<HistoryPageDto>> => {
      const failure = authorizationFailure<HistoryPageDto>(getAuthActor());
      if (failure) return failure;
      // The fixture is deliberately attempt-only; practice results never enter this projection.
      return {
        ok: true,
        data: FIXTURES.history.populated,
        meta: { requestId: "mock:history:attempts" },
      };
    },
    getHistoryTrends: async (): Promise<CertQuizApiResult<HistoryTrendsDto>> => {
      const failure = authorizationFailure<HistoryTrendsDto>(getAuthActor());
      if (failure) return failure;
      return {
        ok: true,
        data: FIXTURES.history.trends,
        meta: { requestId: "mock:history:trends" },
      };
    },
    updateScoreVisibility: async ({
      scorePublic,
      expectedVersion,
    }): Promise<CertQuizApiResult<UpdateScoreVisibilityResponse>> => {
      const actor = getAuthActor();
      const failure = authorizationFailure<UpdateScoreVisibilityResponse>(actor);
      if (failure) return failure;
      const profileActor = approvedActor(actor);
      if (!profileActor) throw new Error("Authorized mock actor is missing a profile.");
      const user = currentUserFor(profileActor);
      if (user.stateVersion !== expectedVersion) {
        return staleVisibilityFailure<UpdateScoreVisibilityResponse>();
      }
      const stateVersion = user.stateVersion + 1;
      currentUsers.set(profileActor, { ...user, scorePublic, stateVersion });
      return {
        ok: true,
        data: { scorePublic, stateVersion },
        meta: { requestId: "mock:profile:visibility" },
      };
    },
    getLeaderboard: async ({
      certificationId,
    }): Promise<CertQuizApiResult<LeaderboardDto>> => {
      const actor = getAuthActor();
      const failure = authorizationFailure<LeaderboardDto>(actor);
      if (failure) return failure;
      const fixture = FIXTURES.leaderboard.tied;
      if (certificationId !== fixture.certificationId) {
        return leaderboardNotFoundFailure<LeaderboardDto>();
      }
      const profileActor = approvedActor(actor);
      if (!profileActor) throw new Error("Authorized mock actor is missing a profile.");
      const scorePublic = currentUserFor(profileActor).scorePublic;
      // Entries, ranks, and tie gaps are server projections: filter privacy without re-ranking.
      const entries = fixture.entries
        .filter((entry) => scorePublic || !entry.isCurrentUser)
        .map((entry) => ({
          ...entry,
          isCurrentUser: scorePublic && entry.isCurrentUser,
        }));
      return {
        ok: true,
        data: { ...fixture, entries },
        meta: { requestId: "mock:leaderboard" },
      };
    },
    getCurrentUser: async (): Promise<CertQuizApiResult<CurrentUserDto>> => {
      const authActor = getAuthActor();
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
        data: currentUserFor(authActor),
        meta: { requestId: `mock:auth:${authActor}:current-user` },
      };
    },
  };
}
