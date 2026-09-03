import type { CertQuizApiError, CertQuizApiResult } from "./port";

/** Safe expected API failure exposed to TanStack Query's error channel. */
export class CertQuizRequestError extends Error {
  readonly detail: CertQuizApiError;

  constructor(detail: CertQuizApiError) {
    super(detail.message);
    this.name = "CertQuizRequestError";
    this.detail = detail;
  }
}

export async function resolveCertQuizResult<T>(
  request: Promise<CertQuizApiResult<T>>,
): Promise<T> {
  const result = await request;
  if (!result.ok) throw new CertQuizRequestError(result.error);
  return result.data;
}
