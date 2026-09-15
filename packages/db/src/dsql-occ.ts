import { isOCCError } from "@aws/aurora-dsql-node-postgres-connector";

/** Recognizes both connector-wrapped conflicts and raw PostgreSQL OC000 errors. */
export function isDsqlOccAbort(error: unknown): boolean {
  if (isOCCError(error)) return true;
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "OC000"
  );
}
