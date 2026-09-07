export type DatabaseAdapterName = "dsql" | "postgres";

export function resolveDatabaseAdapter(
  configured = process.env.CERT_QUIZ_DATABASE_ADAPTER,
): DatabaseAdapterName {
  if (configured === "dsql" || configured === "postgres") return configured;
  throw new Error(
    "CERT_QUIZ_DATABASE_ADAPTER must be explicitly set to dsql or postgres.",
  );
}
