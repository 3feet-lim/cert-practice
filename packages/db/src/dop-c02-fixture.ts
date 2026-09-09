import { Fraction } from "@cert-quiz/domain";
import type { CatalogRevision, CatalogRevisionSource } from "@cert-quiz/domain";

const UUID_PREFIX = "00000000-0000-4000-8000-";
const uuid = (value: number) => `${UUID_PREFIX}${String(value).padStart(12, "0")}`;

const DOMAINS = [
  ["sdlc", "SDLC Automation", 2200, 17],
  ["configuration", "Configuration Management and IaC", 1700, 13],
  ["security", "Security and Compliance", 1700, 13],
  ["resilience", "Resilient Cloud Solutions", 1500, 11],
  ["monitoring", "Monitoring and Logging", 1500, 11],
  ["incident", "Incident and Event Response", 1400, 10],
] as const;

export type DOPC02CatalogFixture = {
  revision: CatalogRevision;
  source: CatalogRevisionSource;
};

/**
 * Backend-owned, deterministic import-shaped catalog source. It has no web
 * fixture dependency and deliberately contains only catalog/generation IDs,
 * not question text, choices, answers, or explanations.
 */
export function createDopC02CatalogFixture(): DOPC02CatalogFixture {
  const revisionId = uuid(900);
  const providerId = uuid(1);
  const certificationId = uuid(2);
  const domains = DOMAINS.map(([key, name, weightBasisPoints], orderIndex) => ({
    id: uuid(10 + orderIndex),
    revisionId,
    certificationId,
    name,
    weightBasisPoints,
    orderIndex,
    key,
  }));
  const questions = domains.flatMap((domain, domainIndex) => {
    const questionCount = DOMAINS[domainIndex]?.[3];
    if (questionCount === undefined) throw new Error("Missing fixture domain count.");
    return Array.from({ length: questionCount }, (_, questionIndex) => ({
      id: uuid(100 + questionsBefore(domainIndex) + questionIndex),
      revisionId,
      certificationId,
      domainId: domain.id,
    }));
  });

  return {
    revision: {
      id: revisionId,
      certificationKey: "DOP-C02",
      contentHash: "d".repeat(64),
      importedBy: uuid(999),
      importedAt: new Date("2026-01-01T00:00:00.000Z"),
      document: { fixture: "DOP-C02" },
    },
    source: {
      revisionId,
      certificationKey: "DOP-C02",
      providers: [
        {
          id: providerId,
          revisionId,
          name: "AWS",
          logoUrl: null,
        },
      ],
      certifications: [
        {
          id: certificationId,
          revisionId,
          providerId,
          externalKey: "DOP-C02",
          code: "DOP-C02",
          name: "AWS Certified DevOps Engineer – Professional",
          totalQuestions: 75,
          timeLimitMinutes: 180,
          passThreshold: Fraction.fromInteger(75n),
          scoringMode: "all_or_nothing",
        },
      ],
      domains: domains.map((domain) => ({
        id: domain.id,
        revisionId: domain.revisionId,
        certificationId: domain.certificationId,
        name: domain.name,
        weightBasisPoints: domain.weightBasisPoints,
        orderIndex: domain.orderIndex,
      })),
      questions,
    },
  };
}

export const DOP_C02_CATALOG_FIXTURE = createDopC02CatalogFixture();

function questionsBefore(domainIndex: number): number {
  return DOMAINS.slice(0, domainIndex).reduce((total, domain) => total + domain[3], 0);
}
