export class Fraction {
  readonly numerator: bigint;
  readonly denominator: bigint;

  private constructor(numerator: bigint, denominator: bigint) {
    this.numerator = numerator;
    this.denominator = denominator;
  }

  static of(numerator: bigint, denominator = 1n): Fraction {
    if (denominator === 0n)
      throw new RangeError("A fraction denominator cannot be zero.");
    if (numerator === 0n) return new Fraction(0n, 1n);

    const sign = denominator < 0n ? -1n : 1n;
    const divisor = greatestCommonDivisor(absolute(numerator), absolute(denominator));
    return new Fraction((sign * numerator) / divisor, (sign * denominator) / divisor);
  }

  static fromInteger(value: bigint): Fraction {
    return Fraction.of(value);
  }

  static parseDecimal(value: string): Fraction {
    const match = /^(?<sign>-?)(?<whole>0|[1-9]\d*)(?:\.(?<fraction>\d*[1-9]))?$/.exec(
      value,
    );
    if (!match?.groups)
      throw new TypeError(`Expected a canonical decimal string: ${value}`);

    const whole = match.groups.whole;
    const fractional = match.groups.fraction ?? "";
    const sign = match.groups.sign === "-" ? -1n : 1n;
    if (whole === undefined) throw new TypeError("Decimal whole part is required.");
    const denominator = 10n ** BigInt(fractional.length);
    const numerator = BigInt(`${whole}${fractional}`);
    return Fraction.of(sign * numerator, denominator);
  }

  add(other: Fraction): Fraction {
    return Fraction.of(
      this.numerator * other.denominator + other.numerator * this.denominator,
      this.denominator * other.denominator,
    );
  }

  subtract(other: Fraction): Fraction {
    return Fraction.of(
      this.numerator * other.denominator - other.numerator * this.denominator,
      this.denominator * other.denominator,
    );
  }

  multiply(other: Fraction): Fraction {
    return Fraction.of(
      this.numerator * other.numerator,
      this.denominator * other.denominator,
    );
  }

  divide(other: Fraction): Fraction {
    if (other.numerator === 0n) throw new RangeError("Cannot divide by zero.");
    return Fraction.of(
      this.numerator * other.denominator,
      this.denominator * other.numerator,
    );
  }

  compare(other: Fraction): -1 | 0 | 1 {
    const difference =
      this.numerator * other.denominator - other.numerator * this.denominator;
    return difference === 0n ? 0 : difference < 0n ? -1 : 1;
  }

  equals(other: Fraction): boolean {
    return this.compare(other) === 0;
  }

  isNegative(): boolean {
    return this.numerator < 0n;
  }

  isZero(): boolean {
    return this.numerator === 0n;
  }

  floor(): bigint {
    if (this.numerator >= 0n) return this.numerator / this.denominator;
    return -((-this.numerator + this.denominator - 1n) / this.denominator);
  }

  halfUpInteger(): bigint {
    const sign = this.numerator < 0n ? -1n : 1n;
    const magnitude = absolute(this.numerator);
    return sign * ((magnitude * 2n + this.denominator) / (this.denominator * 2n));
  }

  displayDecimal(places = 2): string {
    if (!Number.isInteger(places) || places < 0) {
      throw new RangeError("Decimal places must be a non-negative integer.");
    }
    const scale = 10n ** BigInt(places);
    const rounded = this.multiply(Fraction.of(scale)).halfUpInteger();
    const sign = rounded < 0n ? "-" : "";
    const magnitude = absolute(rounded)
      .toString()
      .padStart(places + 1, "0");
    if (places === 0) return `${sign}${magnitude}`;
    return `${sign}${magnitude.slice(0, -places)}.${magnitude.slice(-places)}`;
  }
}

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left;
  let b = right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}
