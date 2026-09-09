export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  private current: Date;

  constructor(initial: Date) {
    this.current = copyValidDate(initial);
  }

  now(): Date {
    return copyValidDate(this.current);
  }

  set(next: Date): void {
    this.current = copyValidDate(next);
  }

  advance(milliseconds: number): void {
    if (!Number.isFinite(milliseconds))
      throw new RangeError("Milliseconds must be finite.");
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

export function toCanonicalUtcTimestamp(value: Date): string {
  return copyValidDate(value).toISOString();
}

export function isWithinHalfOpenInterval(
  value: Date,
  startInclusive: Date,
  endExclusive: Date,
): boolean {
  const time = copyValidDate(value).getTime();
  const start = copyValidDate(startInclusive).getTime();
  const end = copyValidDate(endExclusive).getTime();
  if (end < start)
    throw new RangeError("Half-open interval end must not precede start.");
  return time >= start && time < end;
}

export function hasExpired(value: Date, expiresAt: Date): boolean {
  return copyValidDate(value).getTime() >= copyValidDate(expiresAt).getTime();
}

export function remainingWholeSeconds(now: Date, expiresAt: Date): number {
  return Math.max(
    0,
    Math.floor(
      (copyValidDate(expiresAt).getTime() - copyValidDate(now).getTime()) / 1000,
    ),
  );
}

function copyValidDate(value: Date): Date {
  const copied = new Date(value.getTime());
  if (Number.isNaN(copied.getTime())) throw new RangeError("Date must be valid.");
  return copied;
}
