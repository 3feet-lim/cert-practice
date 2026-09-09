import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { allocateLargestRemainder } from "./catalog.js";
import { ImportService } from "./import-service.js";
import { SequenceRandomSource, SequenceUuidFactory } from "./random.js";
import {
  fullShuffle,
  partialShuffle,
  sampleSession,
  type FullCatalogGenerationSource,
} from "./session-factory.js";
import { Fraction } from "./fraction.js";

const PROPERTY_RUNS = 200;
const NOW = new Date("2026-01-01T00:00:00.000Z");
const ids = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
];

function validDocument() {
  return JSON.stringify({
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
  });
}
function service() {
  return new ImportService({
    ids: new SequenceUuidFactory(ids),
    random: new SequenceRandomSource([1]),
    now: () => new Date(NOW),
  });
}

// Feature: cert-quiz-mvp, Property 23: Import dry-run purity, limits, and independent errors
describe("Property 23: import dry-run validation", () => {
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
  });
});

// Feature: cert-quiz-mvp, Property 5: largest-remainder allocation exactness
describe("Property 5: largest-remainder allocation", () => {
  it("allocates exactly using integer remainders and import-order ties", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 9_999 }),
        (total, leftWeight) => {
          const allocation = allocateLargestRemainder(total, [
            { id: "left", weightBasisPoints: leftWeight, orderIndex: 0 },
            { id: "right", weightBasisPoints: 10_000 - leftWeight, orderIndex: 1 },
          ]);
          expect((allocation.get("left") ?? 0) + (allocation.get("right") ?? 0)).toBe(
            total,
          );
          const exactFloor = Math.floor((total * leftWeight) / 10_000);
          expect(allocation.get("left")).toBeGreaterThanOrEqual(exactFloor);
          expect(allocation.get("left")).toBeLessThanOrEqual(exactFloor + 1);
        },
      ),
      { numRuns: PROPERTY_RUNS },
    );
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
