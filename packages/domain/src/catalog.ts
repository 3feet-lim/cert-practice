import { Fraction } from "./fraction.js";

const BASIS_POINTS_PER_PERCENT = 100n;
const TOTAL_BASIS_POINTS = 10_000n;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CatalogProvider = {
  id: string;
  revisionId: string;
  name: string;
  logoUrl: string | null;
};

export type CatalogCertification = {
  id: string;
  revisionId: string;
  providerId: string;
  externalKey: string;
  code: string;
  name: string;
  totalQuestions: number;
  timeLimitMinutes: number;
  passThreshold: Fraction;
  scoringMode: "all_or_nothing" | "partial";
};

export type CatalogDomain = {
  id: string;
  revisionId: string;
  certificationId: string;
  name: string;
  weightBasisPoints: number;
  orderIndex: number;
};

/** Intentionally excludes stems, choices, answers, and explanations. */
export type CatalogQuestion = {
  id: string;
  revisionId: string;
  certificationId: string;
  domainId: string;
};

/** A typed aggregate read from exactly one revision; it is not a SQL-row shape. */
export type CatalogRevisionSource = {
  revisionId: string;
  certificationKey: string;
  providers: readonly CatalogProvider[];
  certifications: readonly CatalogCertification[];
  domains: readonly CatalogDomain[];
  questions: readonly CatalogQuestion[];
};

export type CatalogDomainProjection = {
  id: string;
  name: string;
  weightPercent: string;
  questionCount: number;
  allocatedQuestionCount: number;
};

export type CatalogCertificationProjection = {
  id: string;
  code: string;
  name: string;
  totalQuestions: number;
  timeLimitMinutes: number;
  passThreshold: string;
  scoringMode: "all_or_nothing" | "partial";
  domains: readonly CatalogDomainProjection[];
};

export type CatalogProviderProjection = {
  id: string;
  name: string;
  logoUrl: string | null;
  certifications: readonly CatalogCertificationProjection[];
};

export type CatalogDataError =
  | {
      kind: "invalid-certification";
      certificationId: string;
      reason: string;
    }
  | {
      kind: "insufficient-domain";
      certificationId: string;
      domainName: string;
      availableQuestionCount: number;
      requiredQuestionCount: number;
    };

export type CatalogProjection = {
  providers: readonly CatalogProviderProjection[];
  dataErrors: readonly CatalogDataError[];
};

export type CatalogGenerationSource = {
  revisionId: string;
  certification: CatalogCertification;
  provider: CatalogProvider;
  domains: readonly CatalogDomain[];
  questions: readonly CatalogQuestion[];
};

type AllocationInput = Pick<CatalogDomain, "id" | "weightBasisPoints" | "orderIndex">;

/**
 * Allocates exactly with bigint basis points. Ties are resolved by immutable
 * import order, never by floating-point representation or object iteration.
 */
export function allocateLargestRemainder(
  totalQuestions: number,
  domains: readonly AllocationInput[],
): ReadonlyMap<string, number> {
  if (!Number.isSafeInteger(totalQuestions) || totalQuestions <= 0)
    throw new RangeError("Total questions must be a positive safe integer.");
  if (domains.length === 0) throw new RangeError("At least one domain is required.");

  const total = BigInt(totalQuestions);
  const allocated = domains.map((domain) => {
    if (
      !Number.isSafeInteger(domain.weightBasisPoints) ||
      domain.weightBasisPoints <= 0 ||
      domain.weightBasisPoints > Number(TOTAL_BASIS_POINTS) ||
      !Number.isSafeInteger(domain.orderIndex) ||
      domain.orderIndex < 0
    ) {
      throw new RangeError("Domain allocation input is invalid.");
    }
    const numerator = total * BigInt(domain.weightBasisPoints);
    return {
      id: domain.id,
      orderIndex: domain.orderIndex,
      count: numerator / TOTAL_BASIS_POINTS,
      remainder: numerator % TOTAL_BASIS_POINTS,
    };
  });
  if (
    domains.reduce((sum, domain) => sum + domain.weightBasisPoints, 0) !==
    Number(TOTAL_BASIS_POINTS)
  ) {
    throw new RangeError("Domain weights must sum to 10,000 basis points.");
  }
  const assigned = allocated.reduce((sum, item) => sum + item.count, 0n);
  const remaining = total - assigned;
  if (remaining < 0n || remaining > BigInt(domains.length))
    throw new RangeError("Domain weights must sum to 10,000 basis points.");

  [...allocated]
    .sort((left, right) => {
      if (left.remainder !== right.remainder)
        return left.remainder > right.remainder ? -1 : 1;
      return left.orderIndex - right.orderIndex;
    })
    .slice(0, Number(remaining))
    .forEach((item) => {
      item.count += 1n;
    });

  return new Map(
    allocated.map((item) => {
      const count = Number(item.count);
      if (!Number.isSafeInteger(count)) throw new RangeError("Allocation is unsafe.");
      return [item.id, count];
    }),
  );
}

/**
 * Projects only active-head sources into the public catalog. Invalid
 * certifications are excluded and diagnostics deliberately avoid raw rows,
 * question content, answers, or implementation details.
 */
export function projectActiveCatalog(
  activeSources: readonly CatalogRevisionSource[],
): CatalogProjection {
  const providers = new Map<
    string,
    {
      id: string;
      name: string;
      logoUrl: string | null;
      certifications: CatalogCertificationProjection[];
    }
  >();
  const dataErrors: CatalogDataError[] = [];

  for (const source of activeSources) {
    for (const certification of source.certifications) {
      const result = validateCertification(source, certification);
      if (result.kind === "invalid") {
        dataErrors.push({
          kind: "invalid-certification",
          certificationId: safeIdentifier(certification.id),
          reason: result.reason,
        });
        continue;
      }
      if (result.insufficient.length > 0) {
        dataErrors.push(...result.insufficient);
        continue;
      }

      const provider = providers.get(result.provider.id) ?? {
        id: result.provider.id,
        name: result.provider.name,
        logoUrl: result.provider.logoUrl,
        certifications: [],
      };
      if (!providers.has(result.provider.id))
        providers.set(result.provider.id, provider);
      provider.certifications.push({
        id: certification.id,
        code: certification.code,
        name: certification.name,
        totalQuestions: certification.totalQuestions,
        timeLimitMinutes: certification.timeLimitMinutes,
        passThreshold: result.passThreshold,
        scoringMode: certification.scoringMode,
        domains: result.domains.map(({ domain, allocation, questionCount }) => ({
          id: domain.id,
          name: domain.name,
          weightPercent: basisPointsToPercent(domain.weightBasisPoints),
          questionCount,
          allocatedQuestionCount: allocation,
        })),
      });
    }
  }

  return { providers: [...providers.values()], dataErrors };
}

/** Returns a closed active-revision source suitable for generation, or null. */
export function findGenerationSource(
  activeSources: readonly CatalogRevisionSource[],
  certificationId: string,
): CatalogGenerationSource | null {
  for (const source of activeSources) {
    const certification = source.certifications.find(
      (candidate) => candidate.id === certificationId,
    );
    if (!certification) continue;
    const result = validateCertification(source, certification);
    if (result.kind === "valid" && result.insufficient.length === 0) {
      return {
        revisionId: source.revisionId,
        certification,
        provider: result.provider,
        domains: result.domains.map(({ domain }) => domain),
        questions: source.questions.filter(
          (question) =>
            question.revisionId === source.revisionId &&
            question.certificationId === certification.id &&
            result.domains.some(({ domain }) => domain.id === question.domainId),
        ),
      };
    }
  }
  return null;
}

type ValidatedCertification =
  | { kind: "invalid"; reason: string }
  | {
      kind: "valid";
      provider: CatalogProvider;
      passThreshold: string;
      domains: readonly {
        domain: CatalogDomain;
        allocation: number;
        questionCount: number;
      }[];
      insufficient: readonly Extract<
        CatalogDataError,
        { kind: "insufficient-domain" }
      >[];
    };

function validateCertification(
  source: CatalogRevisionSource,
  certification: CatalogCertification,
): ValidatedCertification {
  if (
    !validIdentifier(source.revisionId) ||
    !nonEmpty(source.certificationKey) ||
    certification.revisionId !== source.revisionId ||
    certification.externalKey !== source.certificationKey
  ) {
    return invalid("Certification is not a member of its active revision.");
  }
  if (!validIdentifier(certification.id))
    return invalid("Certification identifier is invalid.");
  if (!nonEmpty(certification.code) || !nonEmpty(certification.name))
    return invalid("Certification code and name are required.");
  if (
    !positiveSafeInteger(certification.totalQuestions) ||
    !positiveSafeInteger(certification.timeLimitMinutes)
  ) {
    return invalid(
      "Certification question count and time limit must be positive integers.",
    );
  }
  if (
    certification.scoringMode !== "all_or_nothing" &&
    certification.scoringMode !== "partial"
  ) {
    return invalid("Certification scoring mode is invalid.");
  }

  const passThreshold = thresholdDecimal(certification.passThreshold);
  if (!passThreshold) return invalid("Certification pass threshold is invalid.");

  const parents = source.providers.filter(
    (provider) =>
      provider.id === certification.providerId &&
      provider.revisionId === source.revisionId,
  );
  if (parents.length !== 1 || !validProvider(parents[0]))
    return invalid(
      "Certification must have exactly one valid provider in its active revision.",
    );
  const provider = parents[0];
  if (!provider) return invalid("Certification provider is unavailable.");

  const domains = source.domains.filter(
    (domain) => domain.certificationId === certification.id,
  );
  if (domains.length === 0)
    return invalid("Certification must have at least one domain.");
  if (
    domains.some(
      (domain) =>
        domain.revisionId !== source.revisionId ||
        !validIdentifier(domain.id) ||
        !nonEmpty(domain.name) ||
        !Number.isSafeInteger(domain.orderIndex) ||
        domain.orderIndex < 0 ||
        !Number.isSafeInteger(domain.weightBasisPoints) ||
        domain.weightBasisPoints <= 0 ||
        domain.weightBasisPoints > Number(TOTAL_BASIS_POINTS),
    ) ||
    new Set(domains.map((domain) => domain.id)).size !== domains.length ||
    new Set(domains.map((domain) => domain.orderIndex)).size !== domains.length ||
    domains.reduce((sum, domain) => sum + domain.weightBasisPoints, 0) !==
      Number(TOTAL_BASIS_POINTS)
  ) {
    return invalid("Certification domain configuration is invalid.");
  }

  const domainIds = new Set(domains.map((domain) => domain.id));
  const attachedQuestions = source.questions.filter(
    (question) =>
      question.certificationId === certification.id || domainIds.has(question.domainId),
  );
  if (
    attachedQuestions.some(
      (question) =>
        question.revisionId !== source.revisionId ||
        question.certificationId !== certification.id ||
        !domainIds.has(question.domainId) ||
        !validIdentifier(question.id),
    ) ||
    new Set(attachedQuestions.map((question) => question.id)).size !==
      attachedQuestions.length
  ) {
    return invalid("Certification question relationships are invalid.");
  }

  const allocation = allocateLargestRemainder(certification.totalQuestions, domains);
  const validatedDomains = [...domains]
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .map((domain) => {
      const required = allocation.get(domain.id);
      if (required === undefined) throw new Error("Missing domain allocation.");
      return {
        domain,
        allocation: required,
        questionCount: attachedQuestions.filter(
          (question) => question.domainId === domain.id,
        ).length,
      };
    });
  const insufficient = validatedDomains.flatMap(
    ({ domain, allocation, questionCount }): CatalogDataError[] =>
      questionCount >= allocation
        ? []
        : [
            {
              kind: "insufficient-domain",
              certificationId: certification.id,
              domainName: domain.name,
              availableQuestionCount: questionCount,
              requiredQuestionCount: allocation,
            },
          ],
  ) as Extract<CatalogDataError, { kind: "insufficient-domain" }>[];

  return {
    kind: "valid",
    provider,
    passThreshold,
    domains: validatedDomains,
    insufficient,
  };
}

function invalid(reason: string): ValidatedCertification {
  return { kind: "invalid", reason };
}

function validProvider(
  provider: CatalogProvider | undefined,
): provider is CatalogProvider {
  return !!(
    provider &&
    validIdentifier(provider.id) &&
    nonEmpty(provider.name) &&
    (provider.logoUrl === null || validUrl(provider.logoUrl))
  );
}

function thresholdDecimal(value: Fraction): string | null {
  if (!(value instanceof Fraction) || value.isNegative()) return null;
  if (value.compare(Fraction.fromInteger(100n)) === 1) return null;
  const denominator = value.denominator;
  let remaining = denominator;
  while (remaining % 2n === 0n) remaining /= 2n;
  while (remaining % 5n === 0n) remaining /= 5n;
  if (remaining !== 1n) return null;
  const places = Math.max(powerOf(denominator, 2n), powerOf(denominator, 5n));
  const scaled = (value.numerator * 10n ** BigInt(places)) / denominator;
  const raw = scaled.toString().padStart(places + 1, "0");
  const whole = places === 0 ? raw : raw.slice(0, -places);
  const fractional = places === 0 ? "" : raw.slice(-places).replace(/0+$/, "");
  return fractional.length === 0 ? whole : `${whole}.${fractional}`;
}

function powerOf(value: bigint, factor: bigint): number {
  let current = value;
  let count = 0;
  while (current % factor === 0n && current > 1n) {
    current /= factor;
    count += 1;
  }
  return count;
}

function basisPointsToPercent(value: number): string {
  const whole = Math.floor(value / Number(BASIS_POINTS_PER_PERCENT));
  const remainder = value % Number(BASIS_POINTS_PER_PERCENT);
  return remainder === 0
    ? String(whole)
    : `${whole}.${String(remainder).padStart(2, "0").replace(/0$/, "")}`;
}

function validIdentifier(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function safeIdentifier(value: string): string {
  return nonEmpty(value) ? value.slice(0, 200) : "unknown-certification";
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim() === value;
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function validUrl(value: string): boolean {
  try {
    return new URL(value).toString() === value;
  } catch {
    return false;
  }
}
