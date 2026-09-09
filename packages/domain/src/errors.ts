export type SafeErrorDetail = {
  path: readonly (string | number)[];
  reason: string;
  identifier?: string;
  actual?: null | boolean | number | string;
  expected?: null | boolean | number | string;
};

export type DomainErrorCode =
  | "unauthenticated"
  | "invalid-google-identity"
  | "approval-required"
  | "admin-required"
  | "ownership-denied"
  | "forbidden"
  | "not-found"
  | "expired"
  | "validation-failed"
  | "stale-version"
  | "conflict"
  | "invalid-scoring-configuration"
  | "dependency-unavailable"
  | "submission-failed";

export type DomainError = {
  code: DomainErrorCode;
  details?: readonly SafeErrorDetail[];
};

export class DomainFailure extends Error {
  readonly error: DomainError;

  constructor(error: DomainError) {
    super(error.code);
    this.name = "DomainFailure";
    this.error = error;
  }
}

export function domainFailure(
  code: DomainErrorCode,
  details?: readonly SafeErrorDetail[],
): DomainFailure {
  return new DomainFailure(details === undefined ? { code } : { code, details });
}

export function isDomainFailure(value: unknown): value is DomainFailure {
  return value instanceof DomainFailure;
}
