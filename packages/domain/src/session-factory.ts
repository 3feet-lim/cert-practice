import type { JsonValue } from "@cert-quiz/contracts";

import {
  allocateLargestRemainder,
  type CatalogDomain,
  type CatalogGenerationSource,
} from "./catalog.js";
import { domainFailure } from "./errors.js";
import type {
  NewExamSession,
  NewPracticeSession,
  PersistedQuestionSnapshot,
  TransactionRepositories,
} from "./persistence.js";
import type { RandomSource, UuidFactory } from "./random.js";

/** Internal full content used only to make immutable persistence snapshots. */
export type GenerationChoice = {
  id: string;
  externalId: string;
  text: { en: string; ko: string | null };
};
export type GenerationQuestion = {
  id: string;
  revisionId: string;
  certificationId: string;
  domainId: string;
  domainName: string;
  stem: { en: string; ko: string | null };
  explanation: { en: string; ko: string | null };
  choices: readonly GenerationChoice[];
  correctChoiceIndexes: readonly number[];
  requiredChoiceCount: number;
  translationStatus: "translated" | "en_only";
};
export type FullCatalogGenerationSource = Omit<CatalogGenerationSource, "questions"> & {
  questions: readonly GenerationQuestion[];
};

export type GeneratedSession = {
  certificationKey: string;
  questions: readonly PersistedQuestionSnapshot[];
};

/**
 * Picks an unbiased per-domain subset with partial Fisher–Yates, then applies
 * a full Fisher–Yates display permutation. The RNG is injected and therefore
 * testable; production implementations must supply a rejection-sampling RNG.
 */
export function sampleSession(
  source: FullCatalogGenerationSource,
  random: RandomSource,
): GeneratedSession {
  const allocation = allocateLargestRemainder(
    source.certification.totalQuestions,
    source.domains,
  );
  const insufficient = source.domains.flatMap((domain) => {
    const required = allocation.get(domain.id) ?? 0;
    const available = source.questions.filter(
      (question) => question.domainId === domain.id,
    ).length;
    return available < required ? [{ domain, available, required }] : [];
  });
  if (insufficient.length > 0) {
    throw domainFailure(
      "invalid-scoring-configuration",
      insufficient.map(({ domain, available, required }) => ({
        path: ["domains", domain.name],
        reason: "Question pool is insufficient.",
        actual: available,
        expected: required,
      })),
    );
  }
  const selected = source.domains.flatMap((domain) => {
    const required = allocation.get(domain.id) ?? 0;
    return partialShuffle(
      source.questions.filter((question) => question.domainId === domain.id),
      required,
      random,
    );
  });
  const ordered = fullShuffle(selected, random);
  return {
    certificationKey: source.certification.externalKey,
    questions: ordered.map((question, displayIndex) =>
      snapshot(question, displayIndex, random),
    ),
  };
}

export function partialShuffle<T>(
  input: readonly T[],
  count: number,
  random: RandomSource,
): T[] {
  if (!Number.isSafeInteger(count) || count < 0 || count > input.length)
    throw new RangeError("Sample count must fit the input pool.");
  const copy = [...input];
  for (let index = 0; index < count; index += 1) {
    const chosen = index + random.nextInt(copy.length - index);
    [copy[index], copy[chosen]] = [copy[chosen]!, copy[index]!];
  }
  return copy.slice(0, count);
}
export function fullShuffle<T>(input: readonly T[], random: RandomSource): T[] {
  const copy = [...input];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const chosen = random.nextInt(index + 1);
    [copy[index], copy[chosen]] = [copy[chosen]!, copy[index]!];
  }
  return copy;
}

export type SessionFactoryDependencies = {
  random: RandomSource;
  ids: UuidFactory;
  now: () => Date;
};

/** Transactional application service; callers never receive mutable catalog rows. */
export class SessionFactory {
  constructor(private readonly dependencies: SessionFactoryDependencies) {}

  async createPractice(
    repositories: TransactionRepositories,
    userId: string,
    source: FullCatalogGenerationSource,
  ) {
    const generated = sampleSession(source, this.dependencies.random);
    const session: NewPracticeSession = {
      id: this.dependencies.ids.next(),
      userId,
      certificationKey: generated.certificationKey,
      currentIndex: 0,
      questions: generated.questions,
      createdAt: this.dependencies.now(),
    };
    return repositories.practice.replaceAtomically(session);
  }

  async createExam(
    repositories: TransactionRepositories,
    input: {
      userId: string;
      startRequestKey: string;
      source: FullCatalogGenerationSource;
    },
  ) {
    const generated = sampleSession(input.source, this.dependencies.random);
    const startedAt = this.dependencies.now();
    const expiresAt = new Date(
      startedAt.getTime() + input.source.certification.timeLimitMinutes * 60_000,
    );
    const session: NewExamSession = {
      id: this.dependencies.ids.next(),
      userId: input.userId,
      certificationKey: generated.certificationKey,
      startRequestKey: input.startRequestKey,
      currentIndex: 0,
      startedAt,
      expiresAt,
      questions: generated.questions,
    };
    return repositories.exams.createWithSnapshots(session);
  }
}

function snapshot(
  question: GenerationQuestion,
  displayIndex: number,
  random: RandomSource,
): PersistedQuestionSnapshot {
  const choices = fullSnapshotChoices(fullShuffle(question.choices, random));
  const correctChoiceIds = question.correctChoiceIndexes
    .map((index) => question.choices[index]?.id)
    .filter((id): id is string => id !== undefined);
  const content: JsonValue = {
    revisionId: question.revisionId,
    certificationId: question.certificationId,
    domainId: question.domainId,
    domainName: question.domainName,
    stem: question.stem,
    explanation: question.explanation,
    choices,
    correctChoiceIds,
    requiredChoiceCount: question.requiredChoiceCount,
    translationStatus: question.translationStatus,
  };
  return {
    id: question.id,
    displayIndex,
    content,
    selectedChoiceIds: [],
    finalChoiceIds: null,
    earnedScore: null,
    flagged: false,
    version: 0n,
  };
}
function fullSnapshotChoices(choices: readonly GenerationChoice[]): JsonValue[] {
  return choices.map((choice) => ({ id: choice.id, text: choice.text }));
}

/** Ensures a source's domain metadata has not been separated from its questions. */
export function domainFor(
  source: FullCatalogGenerationSource,
  domainId: string,
): CatalogDomain {
  const domain = source.domains.find((candidate) => candidate.id === domainId);
  if (!domain) throw new Error("Generation question references an unknown domain.");
  return domain;
}
