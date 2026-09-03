import type {
  CertQuizApi,
  CertQuizApiResult,
  CertQuizOperation,
  CertQuizQuery,
} from "./port";

const unavailableResult = <Output>(): CertQuizApiResult<Output> => ({
  ok: false,
  error: {
    code: "dependency-unavailable",
    message: "The CertQuiz API adapter is not configured.",
    requestId: "frontend-api-not-configured",
    retryable: true,
    nextAction: "Configure a mock or HTTP adapter and retry.",
  },
});

const unavailableQuery = async <Output>(): Promise<CertQuizApiResult<Output>> =>
  unavailableResult<Output>();

const unavailableOperation = async <Input, Output>(
  input: Input,
): Promise<CertQuizApiResult<Output>> => {
  void input;
  return unavailableResult<Output>();
};

/**
 * Explicit bootstrap fallback. It keeps composition valid before task 1.5
 * installs the mock adapter and never performs network or persistence work.
 */
export function createUnavailableCertQuizApi(): CertQuizApi {
  const query: CertQuizQuery<never> = unavailableQuery;
  const operation: CertQuizOperation<unknown, never> = unavailableOperation;

  return {
    getHealth: query,
    getApprovalStatus: query,
    getCurrentUser: query,
    getCatalog: query,
    listActivePracticeSessions: query,
    startPractice: operation,
    startExam: operation,
    resumePractice: operation,
    replacePractice: operation,
    patchPracticeState: operation,
    submitPracticeQuestion: operation,
    getExam: operation,
    patchExamState: operation,
    getExamSubmissionPreview: operation,
    submitExam: operation,
    getPracticeResult: operation,
    getAttempt: operation,
    getHistory: operation,
    getHistoryTrends: query,
    updateScoreVisibility: operation,
    getLeaderboard: operation,
    getPendingUsers: query,
    approveUser: operation,
    dryRunImport: operation,
    commitImport: operation,
  };
}
