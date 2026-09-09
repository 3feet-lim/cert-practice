export interface RandomSource {
  nextInt(maxExclusive: number): number;
}

export interface UuidFactory {
  next(): string;
}

export class SequenceRandomSource implements RandomSource {
  private index = 0;

  constructor(private readonly values: readonly number[]) {
    if (values.length === 0)
      throw new RangeError("Deterministic random source needs at least one value.");
  }

  nextInt(maxExclusive: number): number {
    validateMaximum(maxExclusive);
    const value = this.values[this.index % this.values.length];
    this.index += 1;
    if (
      value === undefined ||
      !Number.isInteger(value) ||
      value < 0 ||
      value >= maxExclusive
    ) {
      throw new RangeError(
        "Deterministic random value is outside the requested range.",
      );
    }
    return value;
  }
}

/** Browser/Node Web Crypto adapter using rejection sampling, never modulo bias. */
export class CryptoRandomSource implements RandomSource {
  nextInt(maxExclusive: number): number {
    validateMaximum(maxExclusive);
    const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
    const bytes = new Uint32Array(1);
    for (;;) {
      crypto.getRandomValues(bytes);
      const value = bytes[0];
      if (value !== undefined && value < limit) return value % maxExclusive;
    }
  }
}

export class SequenceUuidFactory implements UuidFactory {
  private index = 0;

  constructor(private readonly values: readonly string[]) {
    if (values.length === 0)
      throw new RangeError("Deterministic UUID factory needs at least one value.");
  }

  next(): string {
    const value = this.values[this.index % this.values.length];
    this.index += 1;
    if (value === undefined)
      throw new Error("Deterministic UUID sequence is exhausted.");
    return value;
  }
}

export function validateMaximum(maxExclusive: number): void {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
    throw new RangeError("maxExclusive must be a positive safe integer.");
  }
}
