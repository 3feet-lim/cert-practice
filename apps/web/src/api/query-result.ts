import type { CertForgeApiError, CertForgeApiResult } from "./port";

/** Safe expected API failure exposed to TanStack Query's error channel. */
export class CertForgeRequestError extends Error {
  readonly detail: CertForgeApiError;

  constructor(detail: CertForgeApiError) {
    super(detail.message);
    this.name = "CertForgeRequestError";
    this.detail = detail;
  }
}

export async function resolveCertForgeResult<T>(
  request: Promise<CertForgeApiResult<T>>,
): Promise<T> {
  const result = await request;
  if (!result.ok) throw new CertForgeRequestError(result.error);
  return result.data;
}
