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
    providers: [{ id: providerId, revisionId, name: "Provider", logoUrl: null }],
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
