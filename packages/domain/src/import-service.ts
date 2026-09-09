import {
  importDocumentSchema,
  type DryRunImportResponse,
  type ImportDocument,
  type ImportSummaryValue,
  type ImportValidationError,
} from "@cert-quiz/contracts";

import {
  allocateLargestRemainder,
  type CatalogDomain,
  type CatalogQuestion,
  type CatalogRevisionSource,
} from "./catalog.js";
import { Fraction } from "./fraction.js";
import type {
  CatalogImportMaterialization,
  CatalogRevision,
  ImportValidation,
} from "./persistence.js";
import type { RandomSource, UuidFactory } from "./random.js";

const MAX_BYTES = 10 * 1_048_576;
const MAX_DEPTH = 20;
const TTL_MS = 15 * 60 * 1_000;

export type ImportValidationResult = {
  response: DryRunImportResponse;
  contentHash: string | null;
  materialization: CatalogImportMaterialization | null;
};

export type ImportServiceDependencies = {
  ids: UuidFactory;
  random: RandomSource;
  now: () => Date;
};

/**
 * Validates transport content without persistence. Valid input is normalized to
 * a closed catalog aggregate; public catalog DTOs never receive its full question content.
 */
export class ImportService {
  constructor(private readonly dependencies: ImportServiceDependencies) {}

  async dryRun(content: string, actorUserId: string): Promise<ImportValidationResult> {
    const errors: ImportValidationError[] = [];
    const byteLength = new TextEncoder().encode(content).byteLength;
    if (byteLength > MAX_BYTES) {
      errors.push(
        error(
          "content-too-large",
          ["content"],
          `Content is ${byteLength} bytes; maximum is ${MAX_BYTES}.`,
        ),
      );
      return {
        response: response(errors, unavailable("Content exceeds the byte limit.")),
        contentHash: null,
        materialization: null,
      };
    }

    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch (cause) {
      errors.push(error("invalid-json", ["content"], syntaxMessage(cause)));
      return {
        response: response(errors, unavailable("JSON could not be parsed.")),
        contentHash: null,
        materialization: null,
      };
    }
    if (depth(raw) > MAX_DEPTH)
      errors.push(
        error(
          "maximum-depth-exceeded",
          ["content"],
          `JSON nesting must not exceed ${MAX_DEPTH}.`,
        ),
      );

    const parsed = importDocumentSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(
          error(
            "invalid-structure",
            issue.path.filter(
              (part): part is string | number =>
                typeof part === "string" || typeof part === "number",
            ),
            issue.message,
          ),
        );
      }
      return {
        response: { valid: false, summary: summaryFromRaw(raw, errors.length), errors },
        contentHash: null,
        materialization: null,
      };
    }

    const document = parsed.data;
    errors.push(...semanticErrors(document));
    const summary = summaryFor(document, errors.length);
    if (errors.length > 0)
      return {
        response: { valid: false, summary, errors },
        contentHash: null,
        materialization: null,
      };

    const canonical = canonicalJson(document);
    const contentHash = await sha256Hex(canonical);
    const validationId = this.dependencies.ids.next();
    const revisionId = this.dependencies.ids.next();
    const now = this.dependencies.now();
    const token = opaqueToken(this.dependencies.random);
    const tokenDigest = await sha256Hex(token);
    const materialization = materialize(
      document,
      revisionId,
      actorUserId,
      contentHash,
      now,
    );
    const validation: ImportValidation = {
      id: validationId,
      actorUserId,
      certificationKey: document.certification.code,
      contentHash,
      tokenDigest,
      expiresAt: new Date(now.getTime() + TTL_MS),
      status: "validated",
      version: 0n,
    };
    return {
      response: {
        valid: true,
        summary,
        errors: [],
        validationId,
        commitToken: token,
        expiresAt: validation.expiresAt.toISOString(),
      },
      contentHash,
      materialization: { ...materialization, validation },
    };
  }

  async materializeCommit(
    content: string,
    actorUserId: string,
  ): Promise<{
    contentHash: string;
    materialization: Omit<CatalogImportMaterialization, "validation">;
  }> {
    const byteLength = new TextEncoder().encode(content).byteLength;
    if (byteLength > MAX_BYTES)
      throw new RangeError("Import content exceeds the byte limit.");
    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      throw new TypeError("Import content is not valid JSON.");
    }
    const parsed = importDocumentSchema.safeParse(raw);
    if (!parsed.success || depth(raw) > MAX_DEPTH)
      throw new TypeError("Import content is invalid.");
    const errors = semanticErrors(parsed.data);
    if (errors.length > 0) throw new TypeError("Import content is invalid.");
    const now = this.dependencies.now();
    const contentHash = await sha256Hex(canonicalJson(parsed.data));
    return {
      contentHash,
      materialization: materialize(
        parsed.data,
        this.dependencies.ids.next(),
        actorUserId,
        contentHash,
        now,
      ),
    };
  }
}

export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("Canonical JSON requires finite numbers.");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new TypeError("Canonical JSON only accepts JSON values.");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Compares equal-length hexadecimal digests without early exit. */
export function constantTimeEqual(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function materialize(
  document: ImportDocument,
  revisionId: string,
  actorUserId: string,
  contentHash: string,
  importedAt: Date,
): Omit<CatalogImportMaterialization, "validation"> {
  const providerId = stableGeneratedId(revisionId, "provider", 0);
  const certificationId = stableGeneratedId(revisionId, "certification", 0);
  const domainIds = new Map(
    document.certification.domains.map((domain, index) => [
      domain.id,
      stableGeneratedId(revisionId, "domain", index),
    ]),
  );
  const source: CatalogRevisionSource = {
    revisionId,
    certificationKey: document.certification.code,
    providers: [
      {
        id: providerId,
        revisionId,
        name: document.provider.name,
        logoUrl: document.provider.logoUrl ?? null,
      },
    ],
    certifications: [
      {
        id: certificationId,
        revisionId,
        providerId,
        externalKey: document.certification.code,
        code: document.certification.code,
        name: document.certification.name,
        totalQuestions: document.certification.totalQuestions,
        timeLimitMinutes: document.certification.timeLimitMinutes,
        passThreshold: Fraction.parseDecimal(document.certification.passThreshold),
        scoringMode: document.certification.scoringMode,
      },
    ],
    domains: document.certification.domains.map(
      (domain, orderIndex): CatalogDomain => ({
        id: required(domainIds.get(domain.id)),
        revisionId,
        certificationId,
        name: domain.name,
        weightBasisPoints: percentToBasisPoints(domain.weightPercent),
        orderIndex,
      }),
    ),
    questions: document.certification.questions.map(
      (question, index): CatalogQuestion => ({
        id: stableGeneratedId(revisionId, "question", index),
        revisionId,
        certificationId,
        domainId: required(domainIds.get(question.domainId)),
      }),
    ),
  };
  const revision: CatalogRevision = {
    id: revisionId,
    certificationKey: document.certification.code,
    contentHash,
    importedBy: actorUserId,
    importedAt: new Date(importedAt),
    document: JSON.parse(canonicalJson(document)),
  };
  return {
    revision,
    source,
    generation: {
      revisionId,
      certification: source.certifications[0]!,
      provider: source.providers[0]!,
      domains: source.domains,
      questions: document.certification.questions.map((question, index) => ({
        id: source.questions[index]!.id,
        revisionId,
        certificationId,
        domainId: required(domainIds.get(question.domainId)),
        domainName: source.domains.find(
          (domain) => domain.id === required(domainIds.get(question.domainId)),
        )!.name,
        stem: { en: question.stemEn, ko: question.stemKo ?? null },
        explanation: { en: question.explanationEn, ko: question.explanationKo ?? null },
        choices: question.choices.map((choice, choiceIndex) => ({
          id: stableGeneratedId(source.questions[index]!.id, "choice", choiceIndex),
          text: { en: choice.textEn, ko: choice.textKo ?? null },
          externalId: choice.id,
        })),
        correctChoiceIndexes: question.correctChoiceIds.map((id) =>
          question.choices.findIndex((choice) => choice.id === id),
        ),
        requiredChoiceCount: question.requiredChoiceCount,
        translationStatus: translated(question) ? "translated" : "en_only",
      })),
    },
  };
}

function semanticErrors(document: ImportDocument): ImportValidationError[] {
  const errors: ImportValidationError[] = [];
  const certification = document.certification;
  const domainIds = new Set<string>();
  const domainCounts = new Map<string, number>();
  let weight = 0;
  certification.domains.forEach((domain, index) => {
    if (domainIds.has(domain.id))
      errors.push(
        error(
          "duplicate-domain-id",
          ["certification", "domains", index, "id"],
          "Domain identifiers must be unique.",
          [domain.id],
        ),
      );
    domainIds.add(domain.id);
    domainCounts.set(domain.id, 0);
    try {
      weight += percentToBasisPoints(domain.weightPercent);
    } catch {
      errors.push(
        error(
          "invalid-domain-weight",
          ["certification", "domains", index, "weightPercent"],
          "Weights must be positive exact basis-point percentages.",
        ),
      );
    }
  });
  if (weight !== 10_000)
    errors.push(
      error(
        "invalid-domain-weights",
        ["certification", "domains"],
        "Domain weights must sum to 100 percent.",
      ),
    );
  const questionIds = new Set<string>();
  certification.questions.forEach((question, index) => {
    if (questionIds.has(question.id))
      errors.push(
        error(
          "duplicate-question-id",
          ["certification", "questions", index, "id"],
          "Question identifiers must be unique.",
          [question.id],
        ),
      );
    questionIds.add(question.id);
    if (!domainIds.has(question.domainId))
      errors.push(
        error(
          "unknown-domain",
          ["certification", "questions", index, "domainId"],
          "Question domain must exist.",
          [question.domainId],
        ),
      );
    else
      domainCounts.set(
        question.domainId,
        (domainCounts.get(question.domainId) ?? 0) + 1,
      );
    const choiceIds = new Set<string>();
    question.choices.forEach((choice, choiceIndex) => {
      if (choiceIds.has(choice.id))
        errors.push(
          error(
            "duplicate-choice-id",
            ["certification", "questions", index, "choices", choiceIndex, "id"],
            "Choice identifiers must be unique within a question.",
            [choice.id],
          ),
        );
      choiceIds.add(choice.id);
      if (!nonBlank(choice.textEn))
        errors.push(
          error(
            "missing-english-content",
            ["certification", "questions", index, "choices", choiceIndex, "textEn"],
            "English choice content is required.",
          ),
        );
    });
    if (!nonBlank(question.stemEn))
      errors.push(
        error(
          "missing-english-content",
          ["certification", "questions", index, "stemEn"],
          "English stem content is required.",
        ),
      );
    if (!nonBlank(question.explanationEn))
      errors.push(
        error(
          "missing-english-content",
          ["certification", "questions", index, "explanationEn"],
          "English explanation content is required.",
        ),
      );
    const correct = new Set(question.correctChoiceIds);
    if (
      correct.size !== question.correctChoiceIds.length ||
      [...correct].some((id) => !choiceIds.has(id))
    )
      errors.push(
        error(
          "invalid-correct-choices",
          ["certification", "questions", index, "correctChoiceIds"],
          "Correct choices must be a unique subset of choices.",
        ),
      );
    if (
      question.requiredChoiceCount > question.choices.length ||
      question.requiredChoiceCount !== correct.size
    )
      errors.push(
        error(
          "invalid-required-choice-count",
          ["certification", "questions", index, "requiredChoiceCount"],
          "Required choice count must equal the number of correct choices and fit the choice list.",
        ),
      );
  });
  if (certification.questions.length > 10_000)
    errors.push(
      error(
        "too-many-questions",
        ["certification", "questions"],
        "At most 10,000 questions are permitted.",
      ),
    );
  try {
    const allocations = allocateLargestRemainder(
      certification.totalQuestions,
      certification.domains.map((domain, orderIndex) => ({
        id: domain.id,
        orderIndex,
        weightBasisPoints: percentToBasisPoints(domain.weightPercent),
      })),
    );
    for (const domain of certification.domains) {
      const available = domainCounts.get(domain.id) ?? 0;
      const needed = allocations.get(domain.id) ?? 0;
      if (available < needed)
        errors.push(
          error(
            "insufficient-domain-pool",
            ["certification", "domains", domain.id],
            `Domain requires ${needed} questions but has ${available}.`,
            [domain.id],
          ),
        );
    }
  } catch {
    /* Weight errors above are more useful and allocation is dependent. */
  }
  return errors;
}

function response(
  errors: ImportValidationError[],
  totalQuestions: ImportSummaryValue,
): DryRunImportResponse {
  return {
    valid: false,
    errors,
    summary: {
      totalQuestions,
      domainQuestionCounts: {},
      translationStatusCounts: {
        translated: unavailable("Document is invalid."),
        enOnly: unavailable("Document is invalid."),
      },
      errorCount: errors.length,
    },
  };
}
function summaryFromRaw(raw: unknown, errorCount: number) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return {
      totalQuestions: unavailable("Document shape is invalid."),
      domainQuestionCounts: {},
      translationStatusCounts: {
        translated: unavailable("Document shape is invalid."),
        enOnly: unavailable("Document shape is invalid."),
      },
      errorCount,
    };
  return {
    totalQuestions: unavailable("Document structure is invalid."),
    domainQuestionCounts: {},
    translationStatusCounts: {
      translated: unavailable("Document structure is invalid."),
      enOnly: unavailable("Document structure is invalid."),
    },
    errorCount,
  };
}
function summaryFor(document: ImportDocument, errorCount: number) {
  const counts = Object.fromEntries(
    document.certification.domains.map((domain) => [
      domain.id,
      {
        status: "available" as const,
        value: document.certification.questions.filter(
          (question) => question.domainId === domain.id,
        ).length,
      },
    ]),
  );
  const translatedCount = document.certification.questions.filter(translated).length;
  return {
    totalQuestions: {
      status: "available" as const,
      value: document.certification.questions.length,
    },
    domainQuestionCounts: counts,
    translationStatusCounts: {
      translated: { status: "available" as const, value: translatedCount },
      enOnly: {
        status: "available" as const,
        value: document.certification.questions.length - translatedCount,
      },
    },
    errorCount,
  };
}
function translated(
  question: ImportDocument["certification"]["questions"][number],
): boolean {
  return (
    question.stemKo !== undefined &&
    question.stemKo !== null &&
    question.explanationKo !== undefined &&
    question.explanationKo !== null &&
    question.choices.every(
      (choice) => choice.textKo !== undefined && choice.textKo !== null,
    )
  );
}
function unavailable(reason: string): ImportSummaryValue {
  return { status: "unavailable", reason };
}
function error(
  code: string,
  path: readonly (string | number)[],
  message: string,
  relatedIdentifiers: readonly string[] = [],
): ImportValidationError {
  return {
    code,
    path: [...path],
    message,
    relatedIdentifiers: [...relatedIdentifiers],
  };
}
function syntaxMessage(cause: unknown): string {
  return cause instanceof SyntaxError ? cause.message.slice(0, 500) : "Invalid JSON.";
}
function depth(value: unknown, current = 0): number {
  if (!value || typeof value !== "object") return current;
  const values = Array.isArray(value)
    ? value
    : Object.values(value as Record<string, unknown>);
  return values.reduce(
    (maximum, child) => Math.max(maximum, depth(child, current + 1)),
    current,
  );
}
function percentToBasisPoints(value: string): number {
  const fraction = Fraction.parseDecimal(value);
  const points = fraction.multiply(Fraction.fromInteger(100n));
  if (points.denominator !== 1n || points.numerator <= 0n || points.numerator > 10_000n)
    throw new RangeError("Weight must be positive basis points.");
  return Number(points.numerator);
}
function nonBlank(value: string): boolean {
  return value.trim().length > 0;
}
function opaqueToken(random: RandomSource): string {
  return Array.from({ length: 32 }, () =>
    random.nextInt(256).toString(16).padStart(2, "0"),
  ).join("");
}
function stableGeneratedId(seed: string, kind: string, index: number): string {
  const kindHex = [...kind]
    .map((character) => character.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
  const hex = `${seed.replace(/-/g, "").slice(0, 8)}${kindHex.slice(0, 16).padEnd(16, "0")}${index.toString(16).padStart(8, "0")}`;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Required generated value is missing.");
  return value;
}
