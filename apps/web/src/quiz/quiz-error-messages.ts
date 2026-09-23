import { CertQuizRequestError } from "../api/query-result";
import type { CertQuizApiError } from "../api/port";

/**
 * Korean copy for the quiz-facing failures. The server message stays canonical
 * for diagnostics, but learners should never read raw English API text.
 */
const quizErrorMessages: Partial<Record<CertQuizApiError["code"], string>> = {
  "answer-locked": "이미 제출한 답변은 변경할 수 없습니다.",
  "stale-version": "다른 곳에서 변경된 내용이 있습니다. 새로 고친 뒤 다시 시도하세요.",
  "content-changed": "문제 내용이 변경되었습니다. 새로 고친 뒤 다시 시도하세요.",
  "transaction-conflict": "동시에 처리된 요청이 있습니다. 다시 시도하세요.",
  "invalid-choice-count": "필요한 개수만큼 답변을 선택하세요.",
  "exam-expired": "모의고사 제한 시간이 만료되었습니다.",
  "exam-finalized": "이미 제출이 완료된 모의고사입니다.",
  "practice-result-expired": "연습 결과 보관 기간이 지났습니다.",
  "rate-limited": "요청이 너무 많습니다. 잠시 후 다시 시도하세요.",
  "ownership-denied": "이 세션에 접근할 수 없습니다.",
  "not-found": "요청한 정보를 찾을 수 없습니다.",
  "dependency-unavailable": "서버가 일시적으로 응답하지 않습니다. 다시 시도하세요.",
};

export function quizErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof CertQuizRequestError) {
    return quizErrorMessages[error.detail.code] ?? fallback;
  }
  return fallback;
}
