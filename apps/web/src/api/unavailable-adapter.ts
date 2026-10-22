import type {
  CertForgeApi,
  CertForgeApiResult,
  CertForgeOperation,
  CertForgeQuery,
} from "./port";

const unavailableResult = <Output>(): CertForgeApiResult<Output> => ({
  ok: false,
  error: {
    code: "dependency-unavailable",
    message: "The CertForge API adapter is not configured.",
    requestId: "frontend-api-not-configured",
    retryable: true,
    nextAction: "Configure a mock or HTTP adapter and retry.",
  },
});

const unavailableQuery = async <Output>(): Promise<CertForgeApiResult<Output>> =>
  unavailableResult<Output>();

const unavailableOperation = async <Input, Output>(
  input: Input,
): Promise<CertForgeApiResult<Output>> => {
  void input;
  return unavailableResult<Output>();
};

/**
 * Explicit bootstrap fallback. It keeps composition valid before task 1.5
 * installs the mock adapter and never performs network or persistence work.
 */
export function createUnavailableCertForgeApi(): CertForgeApi {
  const query: CertForgeQuery<never> = unavailableQuery;
  const operation: CertForgeOperation<unknown, never> = unavailableOperation;

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
