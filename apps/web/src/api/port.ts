import type {
  ActivePracticeSessionsDto,
  ApprovalStatusDto,
  ApproveUserResponse,
  CatalogDto,
  CommitImportRequest,
  CommitImportResponse,
  CurrentUserDto,
  DryRunImportRequest,
  DryRunImportResponse,
  ExamResultDto,
  ExamStateResponse,
  GetExamResponse,
  HistoryCursor,
  HistoryPageDto,
  HealthDto,
  HistoryTrendsDto,
  LeaderboardDto,
  PatchExamStateRequest,
  PatchPracticeStateRequest,
  PendingUsersDto,
  PracticeResultDto,
  PracticeSessionDto,
  PracticeStateResponse,
  ReplacePracticeRequest,
  ResponseMeta,
  StartExamRequest,
  StartExamResponse,
  StartPracticeResponse,
  SubmissionPreviewDto,
  SubmitExamResponse,
  SubmitPracticeQuestionRequest,
  SubmitPracticeQuestionResponse,
  TransportError,
  UpdateScoreVisibilityRequest,
  UpdateScoreVisibilityResponse,
  Uuid,
} from "@cert-quiz/contracts";

/** Expected transport-safe error codes exposed to frontend callers. */
export type CertQuizApiErrorCode =
  | "authentication-invalid"
  | "google-identity-missing"
  | "approval-required"
  | "admin-required"
  | "ownership-denied"
  | "not-found"
  | "practice-result-expired"
  | "validation-failed"
  | "validation-required"
  | "validation-expired"
  | "invalid-choice-count"
  | "invalid-scoring-config"
  | "stale-version"
  | "answer-locked"
  | "content-changed"
  | "token-used"
  | "exam-expired"
  | "exam-finalized"
  | "pool-insufficient"
  | "rate-limited"
  | "dependency-unavailable"
  | "transaction-conflict"
  | "internal-error";

type ErrorWithCode<Code extends CertQuizApiErrorCode> = Omit<TransportError, "code"> & {
  code: Code;
};

export type CertQuizApiError = {
  [Code in CertQuizApiErrorCode]: ErrorWithCode<Code>;
}[CertQuizApiErrorCode];

export type CertQuizApiSuccess<Data> = {
  ok: true;
  data: Data;
  meta?: ResponseMeta;
};

export type CertQuizApiFailure = {
  ok: false;
  error: CertQuizApiError;
};

/**
 * Every expected adapter outcome is a value. Adapters may reject only for
 * programming defects that cannot be represented by the safe error contract.
 */
export type CertQuizApiResult<Data> = CertQuizApiSuccess<Data> | CertQuizApiFailure;

export type CertQuizQuery<Output> = () => Promise<CertQuizApiResult<Output>>;
export type CertQuizOperation<Input, Output> = (
  input: Input,
) => Promise<CertQuizApiResult<Output>>;

export type StartPracticeInput = { certificationId: Uuid };
export type ResumePracticeInput = { practiceSessionId: Uuid };
export type ReplacePracticeInput = ReplacePracticeRequest & {
  practiceSessionId: Uuid;
};
export type PatchPracticeStateInput = PatchPracticeStateRequest & {
  practiceSessionId: Uuid;
};
export type SubmitPracticeQuestionInput = SubmitPracticeQuestionRequest & {
  practiceSessionId: Uuid;
  questionId: Uuid;
};
export type GetPracticeResultInput = { resultId: Uuid };

export type StartExamInput = StartExamRequest & { certificationId: Uuid };
export type GetExamInput = { examSessionId: Uuid };
export type PatchExamStateInput = PatchExamStateRequest & {
  examSessionId: Uuid;
};
export type GetExamSubmissionPreviewInput = { examSessionId: Uuid };
export type SubmitExamInput = { examSessionId: Uuid };
export type GetAttemptInput = { attemptId: Uuid };

export type GetHistoryInput = { cursor?: HistoryCursor };
export type GetLeaderboardInput = { certificationId: Uuid };
export type ApproveUserInput = { userId: Uuid };

/**
 * Replaceable frontend boundary for every S1-S10 server query and mutation.
 * Implementations map these commands to MSW-backed fixtures or real HTTP,
 * while components and stores depend only on this interface.
 */
export interface CertQuizApi {
  // Public bootstrap
  readonly getHealth: CertQuizQuery<HealthDto>;

  // S1 and approval routing
  readonly getApprovalStatus: CertQuizQuery<ApprovalStatusDto>;
  readonly getCurrentUser: CertQuizQuery<CurrentUserDto>;

  // S2-S3 catalog and mode selection
  readonly getCatalog: CertQuizQuery<CatalogDto>;
  readonly listActivePracticeSessions: CertQuizQuery<ActivePracticeSessionsDto>;
  readonly startPractice: CertQuizOperation<StartPracticeInput, StartPracticeResponse>;
  readonly startExam: CertQuizOperation<StartExamInput, StartExamResponse>;

  // S4 practice
  readonly resumePractice: CertQuizOperation<ResumePracticeInput, PracticeSessionDto>;
  readonly replacePractice: CertQuizOperation<ReplacePracticeInput, PracticeSessionDto>;
  readonly patchPracticeState: CertQuizOperation<
    PatchPracticeStateInput,
    PracticeStateResponse
  >;
  readonly submitPracticeQuestion: CertQuizOperation<
    SubmitPracticeQuestionInput,
    SubmitPracticeQuestionResponse
  >;

  // S5 exam
  readonly getExam: CertQuizOperation<GetExamInput, GetExamResponse>;
  readonly patchExamState: CertQuizOperation<PatchExamStateInput, ExamStateResponse>;
  readonly getExamSubmissionPreview: CertQuizOperation<
    GetExamSubmissionPreviewInput,
    SubmissionPreviewDto
  >;
  readonly submitExam: CertQuizOperation<SubmitExamInput, SubmitExamResponse>;

  // S6-S9 results, history, preferences, and leaderboard
  readonly getPracticeResult: CertQuizOperation<
    GetPracticeResultInput,
    PracticeResultDto
  >;
  readonly getAttempt: CertQuizOperation<GetAttemptInput, ExamResultDto>;
  readonly getHistory: CertQuizOperation<GetHistoryInput, HistoryPageDto>;
  readonly getHistoryTrends: CertQuizQuery<HistoryTrendsDto>;
  readonly updateScoreVisibility: CertQuizOperation<
    UpdateScoreVisibilityRequest,
    UpdateScoreVisibilityResponse
  >;
  readonly getLeaderboard: CertQuizOperation<GetLeaderboardInput, LeaderboardDto>;

  // Admin approval and S10 import
  readonly getPendingUsers: CertQuizQuery<PendingUsersDto>;
  readonly approveUser: CertQuizOperation<ApproveUserInput, ApproveUserResponse>;
  readonly dryRunImport: CertQuizOperation<DryRunImportRequest, DryRunImportResponse>;
  readonly commitImport: CertQuizOperation<CommitImportRequest, CommitImportResponse>;
}
