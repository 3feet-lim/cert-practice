import {
  validateMaximum,
  type RandomSource,
  type UuidFactory,
} from "@cert-quiz/domain";

const UINT32_RANGE = 2 ** 32;

/** Uses rejection sampling, so a non-divisor range does not create modulo bias. */
export class CryptoRandomSource implements RandomSource {
  nextInt(maxExclusive: number): number {
    validateMaximum(maxExclusive);
    if (maxExclusive > UINT32_RANGE) {
      throw new RangeError(
        "CryptoRandomSource supports maxExclusive values through 2^32.",
      );
    }

    const acceptedUpperBound = UINT32_RANGE - (UINT32_RANGE % maxExclusive);
    const buffer = new Uint32Array(1);
    for (;;) {
      globalThis.crypto.getRandomValues(buffer);
      const value = buffer[0];
      if (value !== undefined && value < acceptedUpperBound)
        return value % maxExclusive;
    }
  }
}

export class CryptoUuidFactory implements UuidFactory {
  next(): string {
    return globalThis.crypto.randomUUID();
  }
}
