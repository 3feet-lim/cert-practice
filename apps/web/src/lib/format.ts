/**
 * Shared, locale-aware presentation helpers for scores and timestamps.
 * Timestamps are rendered in the viewer's local time zone (the contracts carry UTC).
 */

const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "numeric",
  day: "numeric",
});

export function formatDateTime(value: string): string {
  return dateTimeFormatter.format(new Date(value));
}

export function formatShortDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

/** Formats a decimal string with two fraction digits, passing through non-numeric input. */
export function formatScore(value: string, suffix = ""): string {
  const numeric = Number(value);
  return `${Number.isFinite(numeric) ? numeric.toFixed(2) : value}${suffix}`;
}

/** Formats a percentage with at most one fraction digit, e.g. "80%" or "76.9%". */
export function formatPercent(value: string | number): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return `${Number.isInteger(numeric) ? numeric : numeric.toFixed(1)}%`;
}

/** Signed percentage-point gap, e.g. "+5%p" / "-3.5%p". */
export function formatPointGap(gap: number): string {
  const rounded = Math.round(gap * 10) / 10;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "±";
  return `${sign}${Math.abs(rounded)}%p`;
}

export function clampPercent(value: string | number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(100, Math.max(0, numeric));
}
