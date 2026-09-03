const DEFAULT_RETURN_URL = "/app";

const ALLOWED_APP_PATHS = [
  /^\/app\/?$/,
  /^\/app\/certifications\/[^/]+\/?$/,
  /^\/app\/practice\/[^/]+\/?$/,
  /^\/app\/exams\/[^/]+\/?$/,
  /^\/app\/practice-results\/[^/]+\/?$/,
  /^\/app\/attempts\/[^/]+\/?$/,
  /^\/app\/history\/?$/,
  /^\/app\/leaderboards(?:\/[^/]+)?\/?$/,
  /^\/app\/admin\/(?:users|import)\/?$/,
] as const;

/**
 * Restores only known in-app destinations. Absolute, protocol-relative,
 * encoded-path, traversal, and unknown URLs always fall back to `/app`.
 */
export function getSafeReturnUrl(search: string): string {
  const candidate = new URLSearchParams(search).get("returnTo");

  if (
    candidate === null ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\")
  ) {
    return DEFAULT_RETURN_URL;
  }

  try {
    const base = new URL("https://certquiz.invalid");
    const parsed = new URL(candidate, base);
    const decodedPath = decodeURIComponent(parsed.pathname);

    if (
      parsed.origin !== base.origin ||
      decodedPath !== parsed.pathname ||
      !ALLOWED_APP_PATHS.some((pattern) => pattern.test(parsed.pathname))
    ) {
      return DEFAULT_RETURN_URL;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_RETURN_URL;
  }
}

export function createLoginUrl(returnUrl: string): string {
  const safeReturnUrl = getSafeReturnUrl(
    `?returnTo=${encodeURIComponent(returnUrl)}`,
  );
  return `/login?returnTo=${encodeURIComponent(safeReturnUrl)}`;
}
