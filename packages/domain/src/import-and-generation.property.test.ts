import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { ImportDocument } from "@cert-quiz/contracts";

import { allocateLargestRemainder } from "./catalog.js";
import { Fraction } from "./fraction.js";
import { ImportService } from "./import-service.js";
import { SequenceRandomSource, SequenceUuidFactory } from "./random.js";
import {
  fullShuffle,
  partialShuffle,
  sampleSession,
  type FullCatalogGenerationSource,
} from "./session-factory.js";

const PROPERTY_RUNS = 200;
const PROPERTY_SEED = 20_250_308;
const NOW = new Date("2026-01-01T00:00:00.000Z");
const ids = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
];

type SemanticImportCase = {
  invalidWeights: boolean;
  duplicateQuestion: boolean;
  unknownDomain: boolean;
  duplicateChoice: boolean;
  invalidCorrectChoices: boolean;
  invalidRequiredChoiceCount: boolean;
  blankEnglishStem: boolean;
  translation: "none" | "complete" | "incomplete";
};

type GeneratedDryRunCase =
  | { kind: "syntax" }
  | { kind: "schema" }
  | { kind: "depth" }
  | { kind: "question-cardinality" }
  | { kind: "choice-cardinality" }
  | { kind: "semantic"; semantic: SemanticImportCase };

const semanticImportCaseArbitrary = fc.record({
  invalidWeights: fc.boolean(),
  duplicateQuestion: fc.boolean(),
  unknownDomain: fc.boolean(),
  duplicateChoice: fc.boolean(),
  invalidCorrectChoices: fc.boolean(),
  invalidRequiredChoiceCount: fc.boolean(),
  blankEnglishStem: fc.boolean(),
  translation: fc.constantFrom<SemanticImportCase["translation"]>(
    "none",
    "complete",
    "incomplete",
  ),
});

const generatedDryRunCaseArbitrary = fc.oneof(
  fc.constant<GeneratedDryRunCase>({ kind: "syntax" }),
  fc.constant<GeneratedDryRunCase>({ kind: "schema" }),
  fc.constant<GeneratedDryRunCase>({ kind: "depth" }),
  fc.constant<GeneratedDryRunCase>({ kind: "question-cardinality" }),
  fc.constant<GeneratedDryRunCase>({ kind: "choice-cardinality" }),
  semanticImportCaseArbitrary.map((semantic) => ({ kind: "semantic", semantic })),
);

function validImportDocument(): ImportDocument {
  return {
    provider: { id: "provider", name: "Provider" },
    certification: {
      id: "cert",
      code: "CERT-1",
      name: "Certification",
      totalQuestions: 2,
      timeLimitMinutes: 30,
      passThreshold: "75",
      scoringMode: "all_or_nothing",
      domains: [
        { id: "left", name: "Left", weightPercent: "50" },
        { id: "right", name: "Right", weightPercent: "50" },
      ],
      questions: [
        {
          id: "one",
          domainId: "left",
          stemEn: "One",
          explanationEn: "Because",
          requiredChoiceCount: 1,
          correctChoiceIds: ["a"],
          choices: [
            { id: "a", textEn: "A" },
            { id: "b", textEn: "B" },
          ],
        },
        {
          id: "two",
          domainId: "right",
          stemEn: "Two",
          explanationEn: "Because",
          requiredChoiceCount: 1,
          correctChoiceIds: ["c"],
          choices: [
            { id: "c", textEn: "C" },
            { id: "d", textEn: "D" },
          ],
        },
      ],
    },
  };
}

function validDocument() {
  return JSON.stringify(validImportDocument());
}

function service() {
  return new ImportService({
    ids: new SequenceUuidFactory(ids),
    random: new SequenceRandomSource([1]),
    now: () => new Date(NOW),
  });
}

function semanticDocument(input: SemanticImportCase): ImportDocument {
  const document = validImportDocument();
  const [firstQuestion, secondQuestion] = document.certification.questions;
  if (!firstQuestion || !secondQuestion) throw new Error("Fixture must have two questions.");

  if (input.invalidWeights)
    document.certification.domains[1]!.weightPercent = "40";
  if (input.duplicateQuestion) secondQuestion.id = firstQuestion.id;
  if (input.unknownDomain) secondQuestion.domainId = "missing-domain";
  if (input.duplicateChoice)
    firstQuestion.choices[1]!.id = firstQuestion.choices[0]!.id;
  if (input.invalidCorrectChoices) firstQuestion.correctChoiceIds = ["missing"];
  if (input.invalidRequiredChoiceCount) firstQuestion.requiredChoiceCount = 2;
  if (input.blankEnglishStem) firstQuestion.stemEn = " \t";

  if (input.translation === "complete") {
    for (const question of document.certification.questions) {
      question.stemKo = `${question.stemEn} 한국어`;
      question.explanationKo = `${question.explanationEn} 한국어`;
      for (const choice of question.choices)
        choice.textKo = `${choice.textEn} 한국어`;
    }
  }
  if (input.translation === "incomplete") firstQuestion.stemKo = "일부 한국어";
  return document;
}

function semanticOracle(input: SemanticImportCase) {
  const errors = new Set<string>();
  if (input.invalidWeights) errors.add("invalid-domain-weights");
  if (input.duplicateQuestion) errors.add("duplicate-question-id");
  if (input.unknownDomain) errors.add("unknown-domain");
  if (input.duplicateChoice) errors.add("duplicate-choice-id");
  if (input.invalidCorrectChoices) errors.add("invalid-correct-choices");
  if (input.invalidRequiredChoiceCount)
    errors.add("invalid-required-choice-count");
  if (input.blankEnglishStem) errors.add("missing-english-content");
  if (!input.invalidWeights && input.unknownDomain)
    errors.add("insufficient-domain-pool");

  return {
    errors: [...errors].sort(),
    domainCounts: {
      left: 1,
      right: input.unknownDomain ? 0 : 1,
    },
    translationCounts:
      input.translation === "complete"
        ? { translated: 2, enOnly: 0 }
        : { translated: 0, enOnly: 2 },
  };
}

function deeplyNestedRawDocument() {
  const raw = JSON.parse(validDocument()) as Record<string, unknown>;
  let nested: unknown = "leaf";
  for (let index = 0; index < 21; index += 1) nested = { nested };
  raw.extra = nested;
  return JSON.stringify(raw);
}

function excessiveQuestionDocument() {
  const document = validImportDocument();
  const question = document.certification.questions[0]!;
  document.certification.questions = Array.from({ length: 10_001 }, (_, index) => ({
    ...question,
    id: `question-${index}`,
    choices: question.choices.map((choice) => ({ ...choice })),
    correctChoiceIds: [...question.correctChoiceIds],
  }));
  return JSON.stringify(document);
}

function excessiveChoiceDocument() {
  const document = validImportDocument();
  document.certification.questions[0]!.choices = Array.from(
    { length: 21 },
    (_, index) => ({ id: `choice-${index}`, textEn: `Choice ${index}` }),
  );
  return JSON.stringify(document);
}

function contentFor(input: GeneratedDryRunCase): string {
  switch (input.kind) {
    case "syntax":
      return '{"provider":';
    case "schema":
      return JSON.stringify({ provider: {}, certification: null });
    case "depth":
      return deeplyNestedRawDocument();
    case "question-cardinality":
      return excessiveQuestionDocument();
    case "choice-cardinality":
      return excessiveChoiceDocument();
    case "semantic":
      return JSON.stringify(semanticDocument(input.semantic));
  }
}

function expectUnavailableSummary(result: Awaited<ReturnType<ImportService["dryRun"]>>) {
  expect(result.response.summary.totalQuestions.status).toBe("unavailable");
  expect(result.response.summary.translationStatusCounts.translated.status).toBe(
    "unavailable",
  );
  expect(result.response.summary.translationStatusCounts.enOnly.status).toBe(
    "unavailable",
  );
}

// Feature: cert-quiz-mvp, Property 23: Import dry-run purity, limits, and independent errors
// **Validates: Requirements 15.1-15.19**
describe("Property 23: import dry-run validation", () => {
  it("matches an independent oracle across generated syntax, schema, depth, cardinality, semantic, language, and pool cases without mutating a dry-run catalog", async () => {
    await fc.assert(
      fc.asyncProperty(generatedDryRunCaseArbitrary, async (input) => {
        const importService = service();
        const baseline = await importService.dryRun(validDocument(), "admin-a");
        if (!baseline.materialization)
          throw new Error("The valid import fixture must materialize a catalog.");
        const activeCatalogBefore = structuredClone(baseline.materialization.source);
        const result = await importService.dryRun(contentFor(input), "admin-a");

        // dryRun has no persistence dependency; a later validation cannot alter a prior catalog materialization.
        expect(baseline.materialization.source).toEqual(activeCatalogBefore);

        if (input.kind === "semantic") {
          const expected = semanticOracle(input.semantic);
          expect(result.response.errors.map(({ code }) => code).sort()).toEqual(
            expected.errors,
          );
          expect(result.response.valid).toBe(expected.errors.length === 0);
          expect(result.response.summary).toMatchObject({
            totalQuestions: { status: "available", value: 2 },
            domainQuestionCounts: {
              left: { status: "available", value: expected.domainCounts.left },
              right: { status: "available", value: expected.domainCounts.right },
            },
            translationStatusCounts: {
              translated: {
                status: "available",
                value: expected.translationCounts.translated,
              },
              enOnly: {
                status: "available",
                value: expected.translationCounts.enOnly,
              },
            },
            errorCount: expected.errors.length,
          });
          expect(result.contentHash === null).toBe(expected.errors.length > 0);
          expect(result.materialization === null).toBe(expected.errors.length > 0);
          return;
        }

        expect(result.response.valid).toBe(false);
        expect(result.contentHash).toBeNull();
        expect(result.materialization).toBeNull();
        expectUnavailableSummary(result);
        const errorCodes = result.response.errors.map(({ code }) => code);
        if (input.kind === "syntax") expect(errorCodes).toEqual(["invalid-json"]);
        if (input.kind === "schema") expect(errorCodes).toContain("invalid-structure");
        if (input.kind === "depth") {
          expect(errorCodes).toContain("maximum-depth-exceeded");
          expect(errorCodes).toContain("invalid-structure");
        }
        if (input.kind === "question-cardinality")
          expect(errorCodes).toContain("invalid-structure");
        if (input.kind === "choice-cardinality")
          expect(errorCodes).toContain("invalid-structure");
      }),
      { numRuns: PROPERTY_RUNS, seed: PROPERTY_SEED },
    );
  }, 120_000);

  it("canonicalizes equivalent documents and accumulates independent semantic errors", async () => {
    const first = await service().dryRun(validDocument(), "admin-a");
    const parsedDocument = JSON.parse(validDocument());
    const reordered = JSON.stringify({
      certification: parsedDocument.certification,
      provider: parsedDocument.provider,
    });
    const second = await service().dryRun(reordered, "admin-a");
    expect(first.response.valid).toBe(true);
    expect(first.contentHash).toBe(second.contentHash);

    const invalid = JSON.parse(validDocument());
    invalid.certification.domains[1].weightPercent = "40";
    invalid.certification.questions[0].correctChoiceIds = ["missing"];
    invalid.certification.questions[1].domainId = "missing-domain";
    const result = await service().dryRun(JSON.stringify(invalid), "admin-a");
    expect(result.response.valid).toBe(false);
    expect(result.response.errors.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "invalid-domain-weights",
        "invalid-correct-choices",
        "unknown-domain",
      ]),
    );
    expect(result.response.summary.totalQuestions).toEqual({
      status: "available",
      value: 2,
    });
  });

  it("rejects raw size before JSON parsing", async () => {
    const result = await service().dryRun("x".repeat(10 * 1_048_576 + 1), "admin-a");
    expect(result.response).toMatchObject({ valid: false });
    expect(result.response.errors[0]?.code).toBe("content-too-large");
    expectUnavailableSummary(result);
  });
});

type LargestRemainderCase = {
  totalQuestions: number;
  domains: readonly {
    id: string;
    weightBasisPoints: number;
    orderIndex: number;
  }[];
};

/** Generates positive integer partitions of 10,000 basis points in non-import order. */
const largestRemainderCaseArbitrary = fc.integer({ min: 1, max: 20 }).chain(
  (domainCount) =>
    fc
      .tuple(
        fc.integer({ min: 1, max: 200 }),
        fc.uniqueArray(fc.integer({ min: 1, max: 9_999 }), {
          minLength: domainCount - 1,
          maxLength: domainCount - 1,
        }),
        fc.integer({ min: 0, max: domainCount - 1 }),
      )
      .map(([totalQuestions, cutPoints, rotation]): LargestRemainderCase => {
        const boundaries = [0, ...cutPoints, 10_000].sort((left, right) => left - right);
        const orderedDomains = boundaries.slice(1).map((boundary, orderIndex) => ({
          id: `domain-${orderIndex}`,
          weightBasisPoints: boundary - boundaries[orderIndex]!,
          orderIndex,
        }));
        return {
          totalQuestions,
          domains: [
            ...orderedDomains.slice(rotation),
            ...orderedDomains.slice(0, rotation),
          ],
        };
      }),
);

function generationSourceForAllocation(
  input: LargestRemainderCase,
  allocation: ReadonlyMap<string, number>,
): FullCatalogGenerationSource {
  const revisionId = "allocation-revision";
  const certificationId = "allocation-certification";
  return {
    revisionId,
    provider: { id: "allocation-provider", revisionId, name: "Provider", logoUrl: null },
    certification: {
      id: certificationId,
      revisionId,
      providerId: "allocation-provider",
      externalKey: "ALLOCATION",
      code: "ALLOCATION",
      name: "Allocation",
      totalQuestions: input.totalQuestions,
      timeLimitMinutes: 30,
      passThreshold: Fraction.fromInteger(75n),
      scoringMode: "all_or_nothing",
    },
    domains: input.domains.map((domain) => ({
      ...domain,
      revisionId,
      certificationId,
      name: domain.id,
    })),
    questions: input.domains.flatMap((domain) =>
      Array.from({ length: allocation.get(domain.id) ?? 0 }, (_, index) => ({
        id: `${domain.id}-question-${index}`,
        revisionId,
        certificationId,
        domainId: domain.id,
        domainName: domain.id,
        stem: { en: domain.id, ko: null },
        explanation: { en: "Because", ko: null },
        choices: [
          {
            id: `${domain.id}-choice-${index}`,
            externalId: "a",
            text: { en: "A", ko: null },
          },
        ],
        correctChoiceIndexes: [0],
        requiredChoiceCount: 1,
        translationStatus: "en_only" as const,
      })),
    ),
  };
}

// Feature: cert-quiz-mvp, Property 5: largest-remainder allocation exactness
// **Validates: Requirements 4.1-4.4, 4.8**
describe("Property 5: largest-remainder allocation", () => {
  it("allocates every positive domain partition by floor, remainder, and import order", () => {
    fc.assert(
      fc.property(largestRemainderCaseArbitrary, (input) => {
        const allocation = allocateLargestRemainder(
          input.totalQuestions,
          input.domains,
        );
        const exactAllocations = input.domains.map((domain) => {
          const numerator =
            BigInt(input.totalQuestions) * BigInt(domain.weightBasisPoints);
          return {
            ...domain,
            floor: Number(numerator / 10_000n),
            remainder: numerator % 10_000n,
          };
        });
        const recipientCount =
          input.totalQuestions -
          exactAllocations.reduce((sum, domain) => sum + domain.floor, 0);
        const expectedRecipients = exactAllocations
          .toSorted((left, right) => {
            if (left.remainder !== right.remainder)
              return left.remainder > right.remainder ? -1 : 1;
            return left.orderIndex - right.orderIndex;
          })
          .slice(0, recipientCount)
          .map((domain) => domain.id)
          .toSorted();
        const actualRecipients = exactAllocations
          .filter(
            (domain) => allocation.get(domain.id) === domain.floor + 1,
          )
          .map((domain) => domain.id)
          .toSorted();

        expect(allocation.size).toBe(input.domains.length);
        expect([...allocation.values()].reduce((sum, count) => sum + count, 0)).toBe(
          input.totalQuestions,
        );
        for (const domain of exactAllocations) {
          expect(allocation.get(domain.id)).toBeGreaterThanOrEqual(domain.floor);
          expect(allocation.get(domain.id)).toBeLessThanOrEqual(domain.floor + 1);
        }
        expect(actualRecipients).toEqual(expectedRecipients);

        // SessionFactory routes both practice and exam creation through sampleSession.
        const generated = sampleSession(
          generationSourceForAllocation(input, allocation),
          new SequenceRandomSource([0]),
        );
        for (const domain of input.domains) {
          expect(
            generated.questions.filter((question) =>
              question.id.startsWith(`${domain.id}-question-`),
            ),
          ).toHaveLength(allocation.get(domain.id));
        }
      }),
      { numRuns: PROPERTY_RUNS, seed: PROPERTY_SEED },
    );
  });

  it("breaks equal remainders by immutable import order", () => {
    expect(
      allocateLargestRemainder(3, [
        { id: "first", weightBasisPoints: 5_000, orderIndex: 0 },
        { id: "second", weightBasisPoints: 5_000, orderIndex: 1 },
      ]),
    ).toEqual(
      new Map([
        ["first", 2],
        ["second", 1],
      ]),
    );
  });
});

// Feature: cert-quiz-mvp, Property 6: uniform sampling and permutation
describe("Property 6: sampling and display permutations", () => {
  it("visits each small subset and permutation with the same multiplicity", () => {
    expect(
      [0, 1]
        .map(
          (value) =>
            partialShuffle(["a", "b"], 1, new SequenceRandomSource([value]))[0],
        )
        .sort(),
    ).toEqual(["a", "b"]);
    expect(
      [0, 1]
        .map((value) =>
          fullShuffle(["a", "b"], new SequenceRandomSource([value])).join(""),
        )
        .sort(),
    ).toEqual(["ab", "ba"]);
  });
});

// Feature: cert-quiz-mvp, Property 7: snapshot construction is complete before persistence
describe("Property 7: snapshot generation", () => {
  it("selects without duplicates, uses display order, and reports every insufficient domain", () => {
    const source = generationSource();
    const session = sampleSession(source, new SequenceRandomSource([0]));
    expect(session.questions.map((question) => question.id)).toHaveLength(2);
    expect(new Set(session.questions.map((question) => question.id)).size).toBe(2);
    expect(session.questions.map((question) => question.displayIndex).sort()).toEqual([
      0, 1,
    ]);
    const insufficient: FullCatalogGenerationSource = {
      ...source,
      questions: source.questions.filter((question) => question.domainId === "left"),
    };
    expect(() => sampleSession(insufficient, new SequenceRandomSource([0]))).toThrow(
      "invalid-scoring-configuration",
    );
  });
});

function generationSource(): FullCatalogGenerationSource {
  const revisionId = ids[0]!;
  const certificationId = ids[1]!;
  return {
    revisionId,
    provider: { id: ids[2]!, revisionId, name: "Provider", logoUrl: null },
    certification: {
      id: certificationId,
      revisionId,
      providerId: ids[2]!,
      externalKey: "CERT-1",
      code: "CERT-1",
      name: "Certification",
      totalQuestions: 2,
      timeLimitMinutes: 30,
      passThreshold: Fraction.fromInteger(75n),
      scoringMode: "all_or_nothing",
    },
    domains: [
      {
        id: "left",
        revisionId,
        certificationId,
        name: "Left",
        weightBasisPoints: 5_000,
        orderIndex: 0,
      },
      {
        id: "right",
        revisionId,
        certificationId,
        name: "Right",
        weightBasisPoints: 5_000,
        orderIndex: 1,
      },
    ],
    questions: ["left", "right"].map((domainId, index) => ({
      id: ids[index + 2]!,
      revisionId,
      certificationId,
      domainId,
      domainName: domainId,
      stem: { en: domainId, ko: null },
      explanation: { en: "Because", ko: null },
      choices: [{ id: ids[index]!, externalId: "a", text: { en: "A", ko: null } }],
      correctChoiceIndexes: [0],
      requiredChoiceCount: 1,
      translationStatus: "en_only" as const,
    })),
  };
}
