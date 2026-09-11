import { serialize } from "node:v8";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { ImportDocument } from "@cert-quiz/contracts";
import {
  ImportService,
  SequenceRandomSource,
  SequenceUuidFactory,
  sha256Hex,
} from "@cert-quiz/domain";

import { InMemoryUnitOfWork } from "./in-memory-unit-of-work.js";

const PROPERTY_RUNS = 200;
const PROPERTY_SEED = 20_250_308;
const NOW = new Date("2026-01-01T00:00:00.000Z");
const BASELINE_CERTIFICATION_KEY = "CERT-BASELINE";
const BASELINE_IDS = [
  "00000000-0000-4000-8000-000000000801",
  "00000000-0000-4000-8000-000000000802",
  "00000000-0000-4000-8000-000000000803",
];
const DRY_RUN_IDS = [
  "00000000-0000-4000-8000-000000000811",
  "00000000-0000-4000-8000-000000000812",
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
  | { kind: "valid" }
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
  fc.constant<GeneratedDryRunCase>({ kind: "valid" }),
  fc.constant<GeneratedDryRunCase>({ kind: "syntax" }),
  fc.constant<GeneratedDryRunCase>({ kind: "schema" }),
  fc.constant<GeneratedDryRunCase>({ kind: "depth" }),
  fc.constant<GeneratedDryRunCase>({ kind: "question-cardinality" }),
  fc.constant<GeneratedDryRunCase>({ kind: "choice-cardinality" }),
  semanticImportCaseArbitrary.map((semantic) => ({ kind: "semantic", semantic })),
);

function validImportDocument(code = "CERT-1"): ImportDocument {
  return {
    provider: { id: "provider", name: "Provider" },
    certification: {
      id: "cert",
      code,
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

function createService(ids = DRY_RUN_IDS) {
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

function deeplyNestedRawDocument() {
  const raw = validImportDocument() as Record<string, unknown>;
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
    case "valid":
      return JSON.stringify(validImportDocument());
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

async function commitActiveBaseline(database: InMemoryUnitOfWork): Promise<void> {
  const service = createService(BASELINE_IDS);
  const content = JSON.stringify(validImportDocument(BASELINE_CERTIFICATION_KEY));
  const dryRun = await service.dryRun(content, "admin-a");
  if (!dryRun.materialization?.validation || !dryRun.response.commitToken)
    throw new Error("Baseline import must validate before it can be committed.");
  await database.transaction((repos) =>
    repos.catalog.saveValidation(dryRun.materialization!.validation!),
  );
  const commit = await service.materializeCommit(content, "admin-a");
  const tokenDigest = await sha256Hex(dryRun.response.commitToken);
  await database.transaction((repos) =>
    repos.catalog.commitValidatedImport({
      validationId: dryRun.materialization!.validation!.id,
      actorUserId: "admin-a",
      tokenDigest,
      contentHash: commit.contentHash,
      materialization: commit.materialization,
      now: NOW,
    }),
  );
}

async function activeCatalogSnapshot(database: InMemoryUnitOfWork) {
  return database.transaction(async (repos) => {
    const revision = await repos.catalog.activeRevision(BASELINE_CERTIFICATION_KEY);
    const sources = await repos.catalog.activeCatalogSources();
    const certificationId = sources[0]?.certifications[0]?.id;
    if (!revision || !certificationId)
      throw new Error("Committed baseline catalog must be active and readable.");
    const generation = await repos.catalog.fullGenerationSource(certificationId);
    if (!generation) throw new Error("Committed baseline catalog must generate sessions.");
    return { revision, sources, generation };
  });
}

// Feature: cert-quiz-mvp, Property 23: Import dry-run purity, limits, and independent errors
// **Validates: Requirements 15.1-15.19**
describe("Property 23: persisted import dry-run purity", () => {
  it("keeps a committed active catalog and revision byte/deep equal across generated valid and invalid dry runs", async () => {
    const database = new InMemoryUnitOfWork();
    await commitActiveBaseline(database);
    const before = await activeCatalogSnapshot(database);
    const beforeBytes = serialize(before);

    await fc.assert(
      fc.asyncProperty(generatedDryRunCaseArbitrary, async (input) => {
        await createService().dryRun(contentFor(input), "admin-a");

        const after = await activeCatalogSnapshot(database);
        expect(after).toEqual(before);
        expect(serialize(after)).toEqual(beforeBytes);
      }),
      { numRuns: PROPERTY_RUNS, seed: PROPERTY_SEED },
    );
  }, 120_000);
});
