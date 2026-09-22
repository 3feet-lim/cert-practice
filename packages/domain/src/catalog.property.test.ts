import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  findGenerationSource,
  projectActiveCatalog,
  type CatalogRevisionSource,
} from "./catalog.js";
import { Fraction } from "./fraction.js";

const PROPERTY_RUNS = 200;
const revisionId = "00000000-0000-4000-8000-000000000100";
const providerId = "00000000-0000-4000-8000-000000000101";
const certificationId = "00000000-0000-4000-8000-000000000102";
const leftDomainId = "00000000-0000-4000-8000-000000000103";
const rightDomainId = "00000000-0000-4000-8000-000000000104";

function source(input: {
  leftPool: number;
  rightPool: number;
  breakClosure: boolean;
}): CatalogRevisionSource {
  const questions = [
    ...Array.from({ length: input.leftPool }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(200 + index).padStart(12, "0")}`,
      revisionId,
      certificationId,
      domainId: leftDomainId,
    })),
    ...Array.from({ length: input.rightPool }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(300 + index).padStart(12, "0")}`,
      revisionId,
      certificationId,
      domainId: rightDomainId,
    })),
  ];
  if (input.breakClosure) {
    questions.push({
      id: "00000000-0000-4000-8000-000000000400",
      revisionId,
      certificationId,
      domainId: "00000000-0000-4000-8000-000000000499",
    });
  }
  return {
    revisionId,
    certificationKey: "CERT-1",
    providers: [
      { id: providerId, revisionId, externalKey: "provider", name: "Provider", logoUrl: null },
    ],
    certifications: [
      {
        id: certificationId,
        revisionId,
        providerId,
        externalKey: "CERT-1",
        code: "CERT-1",
        name: "Certification",
        totalQuestions: 3,
        timeLimitMinutes: 10,
        passThreshold: Fraction.fromInteger(75n),
        scoringMode: "all_or_nothing",
      },
    ],
    domains: [
      {
        id: leftDomainId,
        revisionId,
        certificationId,
        name: "Left",
        weightBasisPoints: 5000,
        orderIndex: 0,
      },
      {
        id: rightDomainId,
        revisionId,
        certificationId,
        name: "Right",
        weightBasisPoints: 5000,
        orderIndex: 1,
      },
    ],
    questions,
  };
}

// Feature: cert-quiz-mvp, Property 4: 카탈로그 관계 폐쇄성과 노출 안전성
describe("Property 4: catalog relationship closure and safe exposure", () => {
  it("matches the independent closure/pool oracle and never returns cross-revision generation sources", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 0, max: 2 }),
        fc.boolean(),
        (leftPool, rightPool, breakClosure) => {
          const catalogSource = source({ leftPool, rightPool, breakClosure });
          const actual = projectActiveCatalog([catalogSource]);
          const generation = findGenerationSource([catalogSource], certificationId);

          if (breakClosure) {
            expect(actual.providers).toEqual([]);
            expect(actual.dataErrors).toEqual([
              {
                kind: "invalid-certification",
                certificationId,
                reason: "Certification question relationships are invalid.",
              },
            ]);
            expect(generation).toBeNull();
            return;
          }

          const expectedInsufficient = [
            ...(leftPool < 2
              ? [
                  {
                    kind: "insufficient-domain" as const,
                    certificationId,
                    domainName: "Left",
                    availableQuestionCount: leftPool,
                    requiredQuestionCount: 2,
                  },
                ]
              : []),
            ...(rightPool < 1
              ? [
                  {
                    kind: "insufficient-domain" as const,
                    certificationId,
                    domainName: "Right",
                    availableQuestionCount: rightPool,
                    requiredQuestionCount: 1,
                  },
                ]
              : []),
          ];
          expect(actual.dataErrors).toEqual(expectedInsufficient);
          expect(actual.providers.length).toBe(
            expectedInsufficient.length === 0 ? 1 : 0,
          );
          expect(generation === null).toBe(expectedInsufficient.length > 0);
          if (generation) {
            expect(generation.revisionId).toBe(revisionId);
            expect(
              generation.questions.every(
                (question) => question.revisionId === revisionId,
              ),
            ).toBe(true);
            expect(
              generation.questions.every(
                (question) => question.certificationId === certificationId,
              ),
            ).toBe(true);
            expect(
              generation.questions.every((question) =>
                [leftDomainId, rightDomainId].includes(question.domainId),
              ),
            ).toBe(true);
          }
        },
      ),
      { numRuns: PROPERTY_RUNS },
    );
  });
});

// Regression: two independent imports of the same real-world provider (e.g. both
// AIF-C01 and DOP-C02 importing provider.id "aws") must group under one provider
// entry keyed by the provider's stable external key, not by the derived per-import
// primary key, which differs across independent import operations.
describe("projectActiveCatalog groups providers by external key across independent imports", () => {
  function certificationSource(input: {
    revisionId: string;
    providerId: string;
    certificationId: string;
    domainId: string;
    questionId: string;
    certificationCode: string;
  }): CatalogRevisionSource {
    return {
      revisionId: input.revisionId,
      certificationKey: input.certificationCode,
      providers: [
        {
          id: input.providerId,
          revisionId: input.revisionId,
          externalKey: "aws",
          name: "AWS",
          logoUrl: null,
        },
      ],
      certifications: [
        {
          id: input.certificationId,
          revisionId: input.revisionId,
          providerId: input.providerId,
          externalKey: input.certificationCode,
          code: input.certificationCode,
          name: `Certification ${input.certificationCode}`,
          totalQuestions: 1,
          timeLimitMinutes: 10,
          passThreshold: Fraction.fromInteger(75n),
          scoringMode: "all_or_nothing",
        },
      ],
      domains: [
        {
          id: input.domainId,
          revisionId: input.revisionId,
          certificationId: input.certificationId,
          name: "Domain",
          weightBasisPoints: 10_000,
          orderIndex: 0,
        },
      ],
      questions: [
        {
          id: input.questionId,
          revisionId: input.revisionId,
          certificationId: input.certificationId,
          domainId: input.domainId,
        },
      ],
    };
  }

  it("merges two independently imported revisions sharing provider.id \"aws\" into a single provider", () => {
    // Each independent import derives its own provider primary key from its own
    // revisionId, so these two providers intentionally have DIFFERENT `id`s but
    // the SAME `externalKey`, mirroring two separate real import operations.
    const aifSource = certificationSource({
      revisionId: "00000000-0000-4000-8000-000000000500",
      providerId: "00000000-0000-4000-8000-000000000501",
      certificationId: "00000000-0000-4000-8000-000000000502",
      domainId: "00000000-0000-4000-8000-000000000503",
      questionId: "00000000-0000-4000-8000-000000000504",
      certificationCode: "AIF-C01",
    });
    const dopSource = certificationSource({
      revisionId: "00000000-0000-4000-8000-000000000600",
      providerId: "00000000-0000-4000-8000-000000000601",
      certificationId: "00000000-0000-4000-8000-000000000602",
      domainId: "00000000-0000-4000-8000-000000000603",
      questionId: "00000000-0000-4000-8000-000000000604",
      certificationCode: "DOP-C02",
    });

    const projection = projectActiveCatalog([aifSource, dopSource]);

    expect(projection.dataErrors).toEqual([]);
    expect(projection.providers).toHaveLength(1);
    const [awsProvider] = projection.providers;
    expect(awsProvider?.name).toBe("AWS");
    expect(awsProvider?.certifications.map((item) => item.code).toSorted()).toEqual([
      "AIF-C01",
      "DOP-C02",
    ]);
  });
});
