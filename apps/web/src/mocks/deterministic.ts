export const DEFAULT_FIXTURE_SEED = 0xc3e7_2026;
export const DEFAULT_SERVER_NOW = "2026-03-23T12:00:00.000Z";

const UINT32_RANGE = 0x1_0000_0000;

function assertValidDate(value: Date): void {
  if (Number.isNaN(value.getTime())) {
    throw new RangeError("FakeServerClock requires a valid date.");
  }
}

/** Mutable server-owned UTC clock for deterministic timer and retention fixtures. */
export class FakeServerClock {
  private currentMilliseconds: number;

  constructor(initial: Date | string = DEFAULT_SERVER_NOW) {
    const date = initial instanceof Date ? new Date(initial) : new Date(initial);
    assertValidDate(date);
    this.currentMilliseconds = date.getTime();
  }

  now(): Date {
    return new Date(this.currentMilliseconds);
  }

  iso(): string {
    return this.now().toISOString();
  }

  set(instant: Date | string): void {
    const date = instant instanceof Date ? new Date(instant) : new Date(instant);
    assertValidDate(date);
    this.currentMilliseconds = date.getTime();
  }

  advance(milliseconds: number): void {
    if (!Number.isFinite(milliseconds)) {
      throw new RangeError("Clock advancement must be finite.");
    }
    this.currentMilliseconds += milliseconds;
  }
}

/**
 * Small deterministic xorshift source. Rejection sampling avoids modulo bias,
 * making fixture permutations reproducible without changing their semantics.
 */
export class SeededRandomSource {
  private state: number;

  constructor(seed: number = DEFAULT_FIXTURE_SEED) {
    this.state = seed >>> 0;
    if (this.state === 0) {
      this.state = 0x6d2b_79f5;
    }
  }

  nextUint32(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }

  nextInt(maxExclusive: number): number {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError("maxExclusive must be a positive safe integer.");
    }
    if (maxExclusive > UINT32_RANGE) {
      throw new RangeError("maxExclusive must not exceed 2^32.");
    }

    const acceptanceLimit = Math.floor(UINT32_RANGE / maxExclusive) * maxExclusive;
    let candidate = this.nextUint32();
    while (candidate >= acceptanceLimit) {
      candidate = this.nextUint32();
    }
    return candidate % maxExclusive;
  }
}

function hashLabel(seed: number, label: string, lane: number): number {
  let hash = (0x811c_9dc5 ^ seed ^ Math.imul(lane + 1, 0x9e37_79b1)) >>> 0;
  for (let index = 0; index < label.length; index += 1) {
    hash ^= label.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85eb_ca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2_ae35) >>> 0;
  return (hash ^ (hash >>> 16)) >>> 0;
}

function byteToHex(value: number): string {
  return value.toString(16).padStart(2, "0");
}

/** Order-independent named UUID fixture factory. */
export class SeededIdFactory {
  constructor(private readonly seed: number = DEFAULT_FIXTURE_SEED) {}

  named(label: string): string {
    if (label.length === 0) {
      throw new RangeError("Fixture ID labels must not be empty.");
    }

    const bytes = new Uint8Array(16);
    for (let lane = 0; lane < 4; lane += 1) {
      const hash = hashLabel(this.seed, label, lane);
      const offset = lane * 4;
      bytes[offset] = hash >>> 24;
      bytes[offset + 1] = hash >>> 16;
      bytes[offset + 2] = hash >>> 8;
      bytes[offset + 3] = hash;
    }
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

    const hex = Array.from(bytes, byteToHex).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
}

export function shuffled<T>(values: readonly T[], random: SeededRandomSource): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = random.nextInt(index + 1);
    const current = result[index];
    const replacement = result[swapIndex];
    if (current === undefined || replacement === undefined) {
      throw new Error("Fixture shuffle index escaped array bounds.");
    }
    result[index] = replacement;
    result[swapIndex] = current;
  }
  return result;
}
