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
} from "@cert-forge/contracts";

/** Expected transport-safe error codes exposed to frontend callers. */
export type CertForgeApiErrorCode =
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

type ErrorWithCode<Code extends CertForgeApiErrorCode> = Omit<
  TransportError,
  "code"
> & {
  code: Code;
};

export type CertForgeApiError = {
  [Code in CertForgeApiErrorCode]: ErrorWithCode<Code>;
}[CertForgeApiErrorCode];

export type CertForgeApiSuccess<Data> = {
  ok: true;
  data: Data;
  meta?: ResponseMeta;
};

export type CertForgeApiFailure = {
  ok: false;
  error: CertForgeApiError;
};

/**
 * Every expected adapter outcome is a value. Adapters may reject only for
 * programming defects that cannot be represented by the safe error contract.
 */
export type CertForgeApiResult<Data> = CertForgeApiSuccess<Data> | CertForgeApiFailure;

export type CertForgeQuery<Output> = () => Promise<CertForgeApiResult<Output>>;
export type CertForgeOperation<Input, Output> = (
  input: Input,
) => Promise<CertForgeApiResult<Output>>;

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
export interface CertForgeApi {
  // Public bootstrap
  readonly getHealth: CertForgeQuery<HealthDto>;

  // S1 and approval routing
  readonly getApprovalStatus: CertForgeQuery<ApprovalStatusDto>;
  readonly getCurrentUser: CertForgeQuery<CurrentUserDto>;

  // S2-S3 catalog and mode selection
  readonly getCatalog: CertForgeQuery<CatalogDto>;
  readonly listActivePracticeSessions: CertForgeQuery<ActivePracticeSessionsDto>;
  readonly startPractice: CertForgeOperation<StartPracticeInput, StartPracticeResponse>;
  readonly startExam: CertForgeOperation<StartExamInput, StartExamResponse>;

  // S4 practice
  readonly resumePractice: CertForgeOperation<ResumePracticeInput, PracticeSessionDto>;
  readonly replacePractice: CertForgeOperation<
    ReplacePracticeInput,
    PracticeSessionDto
  >;
  readonly patchPracticeState: CertForgeOperation<
    PatchPracticeStateInput,
    PracticeStateResponse
  >;
  readonly submitPracticeQuestion: CertForgeOperation<
    SubmitPracticeQuestionInput,
    SubmitPracticeQuestionResponse
  >;

  // S5 exam
  readonly getExam: CertForgeOperation<GetExamInput, GetExamResponse>;
  readonly patchExamState: CertForgeOperation<PatchExamStateInput, ExamStateResponse>;
  readonly getExamSubmissionPreview: CertForgeOperation<
    GetExamSubmissionPreviewInput,
    SubmissionPreviewDto
  >;
  readonly submitExam: CertForgeOperation<SubmitExamInput, SubmitExamResponse>;

  // S6-S9 results, history, preferences, and leaderboard
  readonly getPracticeResult: CertForgeOperation<
    GetPracticeResultInput,
    PracticeResultDto
  >;
  readonly getAttempt: CertForgeOperation<GetAttemptInput, ExamResultDto>;
  readonly getHistory: CertForgeOperation<GetHistoryInput, HistoryPageDto>;
  readonly getHistoryTrends: CertForgeQuery<HistoryTrendsDto>;
  readonly updateScoreVisibility: CertForgeOperation<
    UpdateScoreVisibilityRequest,
    UpdateScoreVisibilityResponse
  >;
  readonly getLeaderboard: CertForgeOperation<GetLeaderboardInput, LeaderboardDto>;

  // Admin approval and S10 import
  readonly getPendingUsers: CertForgeQuery<PendingUsersDto>;
  readonly approveUser: CertForgeOperation<ApproveUserInput, ApproveUserResponse>;
  readonly dryRunImport: CertForgeOperation<DryRunImportRequest, DryRunImportResponse>;
  readonly commitImport: CertForgeOperation<CommitImportRequest, CommitImportResponse>;
}
