import type {
  ExamActiveSessionDto,
  ExamResultDto,
  GetExamResponse,
  HistoryPageDto,
  HistoryTrendsDto,
  LeaderboardDto,
  PatchExamStateRequest,
  PatchPracticeStateRequest,
  PracticeResultDto,
  PracticeSessionDto,
  StartPracticeResponse,
  SubmissionPreviewDto,
  SubmitPracticeQuestionResponse,
} from "@cert-quiz/contracts";
import {
  examActiveSessionDtoSchema,
  examResultDtoSchema,
  getExamResponseSchema,
  historyPageDtoSchema,
  historyTrendsDtoSchema,
  leaderboardDtoSchema,
  practiceResultDtoSchema,
  practiceSessionDtoSchema,
  startPracticeResponseSchema,
  submissionPreviewDtoSchema,
  submitPracticeQuestionResponseSchema,
} from "@cert-quiz/contracts";

import { domainFailure } from "./errors.js";
import { Fraction } from "./fraction.js";
import type {
  Attempt,
  ExamSession,
  PersistedQuestionSnapshot,
  PracticeSession,
  TransactionRepositories,
  UnitOfWork,
} from "./persistence.js";
import { scoreAttempt, scoreQuestion } from "./scoring.js";
import { SessionFactory, type FullCatalogGenerationSource } from "./session-factory.js";
import {
  projectExamActive,
  projectPracticeSubmitted,
  projectPracticeUnsubmitted,
  projectReview,
  type QuestionSnapshot,
} from "./snapshot-projector.js";
import { hasExpired, remainingWholeSeconds } from "./time.js";

const RETENTION_MS = 168 * 60 * 60 * 1000;

type SnapshotContent = {
  certification: {
    id: string;
    code: string;
    name: string;
    scoringMode: "all_or_nothing" | "partial";
    passThreshold: string;
  };
  domainName: string;
  stem: { en: string; ko: string | null };
  explanation: { en: string; ko: string | null };
  choices: readonly { id: string; text: { en: string; ko: string | null } }[];
  correctChoiceIds: readonly string[];
  requiredChoiceCount: number;
  translationStatus: "translated" | "en_only";
};

export type LifecycleDependencies = {
  unitOfWork: UnitOfWork;
  sessionFactory: SessionFactory;
  now: () => Date;
  createId: () => string;
};

/**
 * Offline-safe application service. It deliberately relies only on domain ports;
 * SQL conditional writes, scheduler invocation, and deployment composition remain
 * adapter/infrastructure responsibilities.
 */
export class LifecycleServices {
  constructor(private readonly dependencies: LifecycleDependencies) {}

  async startPractice(
    userId: string,
    certificationId: string,
  ): Promise<StartPracticeResponse> {
    return this.dependencies.unitOfWork.transaction(async (repos) => {
      const source = await requiredSource(repos, certificationId);
      const active = await repos.practice.findActiveOwned(
        userId,
        source.certification.externalKey,
      );
      if (active) return startPracticeResponseSchema.parse(resumeRequired(active));
      const session = await this.dependencies.sessionFactory.createPractice(
        repos,
        userId,
        source,
      );
      return startPracticeResponseSchema.parse({
        kind: "created",
        practiceSessionId: session.id,
        stateVersion: version(session.version),
      });
    });
  }

  async replacePractice(
    userId: string,
    certificationId: string,
    confirmationNonce: string,
  ): Promise<StartPracticeResponse> {
    if (confirmationNonce.trim().length === 0) throw domainFailure("validation-failed");
    return this.dependencies.unitOfWork.transaction(async (repos) => {
      const source = await requiredSource(repos, certificationId);
      const session = await this.dependencies.sessionFactory.createPractice(
        repos,
        userId,
        source,
      );
      return startPracticeResponseSchema.parse({
        kind: "created",
        practiceSessionId: session.id,
        stateVersion: version(session.version),
      });
    });
  }

  async resumePractice(userId: string, sessionId: string): Promise<PracticeSessionDto> {
    return this.dependencies.unitOfWork.transaction(async (repos) => {
      const session = await repos.practice.getOwned(userId, sessionId);
      if (!session) throw domainFailure("not-found");
      return projectPracticeSession(session);
    });
  }

  async patchPractice(
    userId: string,
    sessionId: string,
    request: PatchPracticeStateRequest,
  ) {
    return this.dependencies.unitOfWork.transaction(async (repos) => {
      const current = await repos.practice.getOwned(userId, sessionId);
      if (!current) throw domainFailure("not-found");
      const updated = applyPracticePatch(current, request);
      const saved = await repos.practice.replaceState({
        userId,
        sessionId,
        expectedVersion: BigInt(request.expectedVersion),
        session: updated,
      });
      if (!saved) throw domainFailure("stale-version");
      return {
        practiceSessionId: saved.id,
        stateVersion: version(saved.version),
        currentIndex: saved.currentIndex,
      };
    });
  }

  async submitPractice(
    userId: string,
    sessionId: string,
    questionId: string,
    selectedChoiceIds: readonly string[],
    expectedVersion: number,
  ): Promise<SubmitPracticeQuestionResponse> {
    return this.dependencies.unitOfWork.transaction(async (repos) => {
      const session = await repos.practice.getOwned(userId, sessionId);
      if (!session) throw domainFailure("not-found");
      const question = requiredQuestion(session.questions, questionId);
      if (question.finalChoiceIds) {
        if (!sameSet(question.finalChoiceIds, selectedChoiceIds))
          throw domainFailure("conflict");
        return submitPracticeQuestionResponseSchema.parse({
          practiceSessionId: session.id,
          stateVersion: version(session.version),
          question: projectPracticeSubmitted(toQuestionSnapshot(question)),
          ...(session.resultId ? { completedPracticeResultId: session.resultId } : {}),
        });
      }
      if (session.status !== "active" || session.version !== BigInt(expectedVersion))
        throw domainFailure("stale-version");
      validateSelected(question, selectedChoiceIds);
      const earned = scoreQuestion(
        content(question).certification.scoringMode,
        scoringQuestion(question, selectedChoiceIds),
      );
      const completed = completesWith(session, questionId);
      const result = completed
        ? makePracticeResult(
            session,
            questionId,
            selectedChoiceIds,
            earned.earnedScore,
            this.dependencies.createId(),
            this.dependencies.now(),
          )
        : undefined;
      const saved = await repos.practice.submitFirstAnswer({
        userId,
        sessionId,
        expectedVersion: BigInt(expectedVersion),
        questionId,
        selectedChoiceIds,
        earnedScore: earned.earnedScore,
        ...(result ? { completedResult: result } : {}),
      });
      if (!saved) throw domainFailure("stale-version");
      const savedQuestion = requiredQuestion(saved.session.questions, questionId);
      return submitPracticeQuestionResponseSchema.parse({
        practiceSessionId: saved.session.id,
        stateVersion: version(saved.session.version),
        question: projectPracticeSubmitted(toQuestionSnapshot(savedQuestion)),
        ...(saved.result ? { completedPracticeResultId: saved.result.id } : {}),
      });
    });
  }

  async getPracticeResult(
    userId: string,
    resultId: string,
  ): Promise<PracticeResultDto> {
    return this.dependencies.unitOfWork.transaction(async (repos) => {
      const result = await repos.practice.getCompletedOwned(
        userId,
        resultId,
        this.dependencies.now(),
      );
      if (!result) throw domainFailure("expired");
      return practiceResultDtoSchema.parse(result.payload);
    });
  }

  async cleanupPracticeResults(batchSize: number): Promise<number> {
    return this.dependencies.unitOfWork.transaction((repos) =>
      repos.practice.deleteExpired(this.dependencies.now(), batchSize),
    );
  }

  async startExam(userId: string, certificationId: string, idempotencyKey: string) {
    return this.dependencies.unitOfWork.transaction(async (repos) => {
      const source = await requiredSource(repos, certificationId);
      const session = await this.dependencies.sessionFactory.createExam(repos, {
        userId,
        startRequestKey: idempotencyKey,
        source,
      });
      const now = this.dependencies.now();
      return {
        examSessionId: session.id,
        stateVersion: version(session.version),
        startedAt: session.startedAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        serverNow: now.toISOString(),
      };
    });
  }

  async getExam(userId: string, sessionId: string): Promise<GetExamResponse> {
    return this.dependencies.unitOfWork.transaction(async (repos) => {
      const session = await repos.exams.getOwned(userId, sessionId);
      if (!session) throw domainFailure("not-found");
      if (session.status === "submitted")
        return getExamResponseSchema.parse({
          kind: "exam-finalized",
          examSessionId: session.id,
          attemptId: session.attemptId,
        });
      return projectActiveExam(session, this.dependencies.now());
    });
  }

  async patchExam(userId: string, sessionId: string, request: PatchExamStateRequest) {
    const now = this.dependencies.now();
    return this.dependencies.unitOfWork.transaction(async (repos) => {
      const current = await repos.exams.getOwned(userId, sessionId);
      if (!current) throw domainFailure("not-found");
      if (hasExpired(now, current.expiresAt)) throw domainFailure("expired");
      const updated = applyExamPatch(current, request, now);
      const saved = await repos.exams.replaceState({
        userId,
        sessionId,
        expectedVersion: BigInt(request.expectedVersion),
        session: updated,
        now,
      });
      if (!saved) throw domainFailure("stale-version");
      return {
        examSessionId: saved.id,
        stateVersion: version(saved.version),
        currentIndex: saved.currentIndex,
        serverNow: now.toISOString(),
        remainingSeconds: remainingWholeSeconds(now, saved.expiresAt),
      };
    });
  }

  async previewExam(userId: string, sessionId: string): Promise<SubmissionPreviewDto> {
    return this.dependencies.unitOfWork.transaction(async (repos) => {
      const session = await repos.exams.getOwned(userId, sessionId);
      if (!session) throw domainFailure("not-found");
      return submissionPreviewDtoSchema.parse({
        examSessionId: session.id,
        unansweredQuestionCount: session.questions.filter(
          (question) =>
            question.selectedChoiceIds.length !== content(question).requiredChoiceCount,
        ).length,
        flaggedQuestionCount: session.questions.filter((question) => question.flagged)
          .length,
        stateVersion: version(session.version),
      });
    });
  }

  async submitExam(
    userId: string,
    sessionId: string,
    requestReceivedAt = this.dependencies.now(),
  ): Promise<ExamResultDto> {
    return this.dependencies.unitOfWork.transaction(async (repos) => {
      const session = await repos.exams.getOwned(userId, sessionId);
      if (!session) throw domainFailure("not-found");
      const reason = requestReceivedAt < session.expiresAt ? "manual" : "expired";
      return finalize(
        repos,
        session,
        userId,
        reason,
        requestReceivedAt,
        this.dependencies.createId(),
      );
    });
  }

  async finalizeExpiredOwned(
    userId: string,
    requestReceivedAt = this.dependencies.now(),
  ): Promise<void> {
    return this.dependencies.unitOfWork.transaction(async (repos) => {
      const expired = await repos.exams.listExpiredOwned(userId, requestReceivedAt);
      for (const session of expired)
        await finalize(
          repos,
          session,
          userId,
          "expired",
          requestReceivedAt,
          this.dependencies.createId(),
        );
    });
  }

  async getAttempt(userId: string, attemptId: string): Promise<ExamResultDto> {
    return this.dependencies.unitOfWork.transaction(async (repos) => {
      const attempt = await repos.history.getAttemptOwned(userId, attemptId);
      if (!attempt) throw domainFailure("not-found");
      return projectAttempt(attempt);
    });
  }

  async history(userId: string): Promise<HistoryPageDto> {
    return this.dependencies.unitOfWork.transaction(async (repos) =>
      historyPageDtoSchema.parse({
        attempts: (await repos.history.listAttempts(userId)).map(summary),
        nextCursor: null,
      }),
    );
  }

  async trends(userId: string): Promise<HistoryTrendsDto> {
    return this.dependencies.unitOfWork.transaction(async (repos) => {
      const attempts = await repos.history.listAttempts(userId);
      const groups = new Map<string, Attempt[]>();
      for (const attempt of attempts) {
        const id = content(attempt.items[0]!).certification.id;
        groups.set(id, [...(groups.get(id) ?? []), attempt]);
      }
      return historyTrendsDtoSchema.parse({
        certifications: [...groups.values()].map((items) => {
          const first = content(items[0]!.items[0]!);
          const ordered = [...items].sort(
            (a, b) =>
              a.submittedAt.getTime() - b.submittedAt.getTime() ||
              a.id.localeCompare(b.id),
          );
          return {
            certificationId: first.certification.id,
            certificationCode: first.certification.code,
            certificationName: first.certification.name,
            attemptCount: ordered.length,
            points: ordered.map((attempt) => ({
              attemptId: attempt.id,
              accuracyRate: decimal(attempt.accuracyRate),
              submittedAt: attempt.submittedAt.toISOString(),
            })),
          };
        }),
      });
    });
  }

  async leaderboard(
    certificationId: string,
    currentUserId: string,
  ): Promise<LeaderboardDto> {
    return this.dependencies.unitOfWork.transaction(async (repos) => {
      const candidates = await repos.history.listPublicAttempts(certificationId);
      const byUser = new Map<string, { attempt: Attempt; displayName: string }>();
      for (const candidate of candidates) {
        const prior = byUser.get(candidate.user.id);
        if (!prior || compareRepresentative(candidate.attempt, prior.attempt) < 0)
          byUser.set(candidate.user.id, {
            attempt: candidate.attempt,
            displayName: candidate.user.displayName,
          });
      }
      const entries = [...byUser.entries()]
        .sort(
          ([, a], [, b]) =>
            b.attempt.accuracyRate.compare(a.attempt.accuracyRate) ||
            a.attempt.submittedAt.getTime() - b.attempt.submittedAt.getTime() ||
            a.attempt.userId.localeCompare(b.attempt.userId),
        )
        .map(([userId, candidate], index, list) => ({
          rank:
            1 +
            list
              .slice(0, index)
              .filter(
                ([, other]) =>
                  other.attempt.accuracyRate.compare(candidate.attempt.accuracyRate) >
                  0,
              ).length,
          userId,
          displayName: candidate.displayName,
          accuracyRate: decimal(candidate.attempt.accuracyRate),
          rawScore: decimal(candidate.attempt.rawScore),
          attemptId: candidate.attempt.id,
          submittedAt: candidate.attempt.submittedAt.toISOString(),
          isCurrentUser: userId === currentUserId,
        }));
      const first = candidates[0] && content(candidates[0].attempt.items[0]!);
      if (!first) throw domainFailure("not-found");
      return leaderboardDtoSchema.parse({
        certificationId,
        certificationCode: first.certification.code,
        certificationName: first.certification.name,
        entries,
      });
    });
  }
}

async function requiredSource(
  repos: TransactionRepositories,
  certificationId: string,
): Promise<FullCatalogGenerationSource> {
  const source = await repos.catalog.fullGenerationSource(certificationId);
  if (!source) throw domainFailure("not-found");
  return source;
}
function version(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0)
    throw domainFailure("dependency-unavailable");
  return result;
}
function resumeRequired(session: PracticeSession) {
  const first = content(session.questions[0]!);
  return {
    kind: "resume-or-replace-required" as const,
    session: {
      practiceSessionId: session.id,
      certificationId: first.certification.id,
      certificationCode: first.certification.code,
      currentQuestionNumber: session.currentIndex + 1,
      totalQuestions: session.questions.length,
      stateVersion: version(session.version),
      updatedAt: session.createdAt.toISOString(),
    },
    allowedActions: ["resume", "replace"] as const,
  };
}
function content(question: PersistedQuestionSnapshot): SnapshotContent {
  const value = question.content as unknown;
  if (!value || typeof value !== "object")
    throw domainFailure("dependency-unavailable");
  const parsed = value as Partial<SnapshotContent>;
  if (
    !parsed.certification ||
    !Array.isArray(parsed.choices) ||
    !Array.isArray(parsed.correctChoiceIds) ||
    !parsed.stem ||
    !parsed.explanation ||
    typeof parsed.domainName !== "string" ||
    typeof parsed.requiredChoiceCount !== "number" ||
    (parsed.translationStatus !== "translated" &&
      parsed.translationStatus !== "en_only")
  )
    throw domainFailure("dependency-unavailable");
  return parsed as SnapshotContent;
}
function toQuestionSnapshot(question: PersistedQuestionSnapshot): QuestionSnapshot {
  const source = content(question);
  const selected = question.finalChoiceIds ?? question.selectedChoiceIds;
  const score = question.earnedScore ?? Fraction.fromInteger(0n);
  return {
    id: question.id as QuestionSnapshot["id"],
    displayNumber: question.displayIndex + 1,
    domainName: source.domainName,
    stem: source.stem,
    choices: source.choices as QuestionSnapshot["choices"],
    requiredChoiceCount: source.requiredChoiceCount,
    selectedChoiceIds: selected as QuestionSnapshot["selectedChoiceIds"],
    flagged: question.flagged,
    translationStatus: source.translationStatus,
    correctChoiceIds: source.correctChoiceIds as QuestionSnapshot["correctChoiceIds"],
    isCorrect: scoreQuestion(
      source.certification.scoringMode,
      scoringQuestion(question, selected),
    ).isCorrect,
    earnedScore: decimal(score),
    explanation: source.explanation,
  };
}
function scoringQuestion(
  question: PersistedQuestionSnapshot,
  selected: readonly string[],
) {
  const source = content(question);
  return {
    id: question.id,
    choiceIds: source.choices.map((choice) => choice.id),
    correctChoiceIds: source.correctChoiceIds,
    requiredChoiceCount: source.requiredChoiceCount,
    selectedChoiceIds: selected,
  };
}
function validateSelected(
  question: PersistedQuestionSnapshot,
  selected: readonly string[],
) {
  const source = content(question);
  const unique = new Set(selected);
  if (
    unique.size !== selected.length ||
    selected.length !== source.requiredChoiceCount ||
    selected.some((id) => !source.choices.some((choice) => choice.id === id))
  )
    throw domainFailure("validation-failed");
}
function requiredQuestion(questions: readonly PersistedQuestionSnapshot[], id: string) {
  const question = questions.find((candidate) => candidate.id === id);
  if (!question) throw domainFailure("not-found");
  return question;
}
function sameSet(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    new Set(left).size === new Set(right).size &&
    left.every((id) => right.includes(id))
  );
}
function completesWith(session: PracticeSession, id: string) {
  return session.questions.every(
    (question) => question.id === id || question.finalChoiceIds !== null,
  );
}
function decimal(value: Fraction) {
  return value
    .displayDecimal(12)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1");
}
function applyPracticePatch(
  session: PracticeSession,
  request: PatchPracticeStateRequest,
): PracticeSession {
  const updated: PracticeSession = { ...session, questions: session.questions };
  if (
    request.currentIndex !== undefined &&
    request.currentIndex >= session.questions.length
  )
    throw domainFailure("validation-failed");
  if (request.currentIndex !== undefined) updated.currentIndex = request.currentIndex;
  const changes = [
    request.answer && {
      id: request.answer.questionId,
      selected: request.answer.selectedChoiceIds,
    },
    request.flag && { id: request.flag.questionId, flagged: request.flag.flagged },
  ].filter(Boolean) as {
    id: string;
    selected?: readonly string[];
    flagged?: boolean;
  }[];
  updated.questions = updated.questions.map((question) => {
    const change = changes
      .filter((candidate) => candidate.id === question.id)
      .reduce<
        { id: string; selected?: readonly string[]; flagged?: boolean } | undefined
      >((merged, candidate) => ({ ...(merged ?? candidate), ...candidate }), undefined);
    if (!change) return question;
    if (question.finalChoiceIds) throw domainFailure("conflict");
    if (change.selected) validateSelected(question, change.selected);
    return {
      ...question,
      ...(change.selected ? { selectedChoiceIds: [...change.selected] } : {}),
      ...(change.flagged === undefined ? {} : { flagged: change.flagged }),
      version: question.version + 1n,
    };
  });
  if (
    changes.some(
      (change) => !session.questions.some((question) => question.id === change.id),
    )
  )
    throw domainFailure("not-found");
  return updated;
}
function applyExamPatch(
  session: ExamSession,
  request: PatchExamStateRequest,
  now: Date,
): ExamSession {
  const updated: ExamSession = { ...session, questions: session.questions };
  if (
    request.currentIndex !== undefined &&
    request.currentIndex >= session.questions.length
  )
    throw domainFailure("validation-failed");
  if (request.currentIndex !== undefined) updated.currentIndex = request.currentIndex;
  const changes = [
    request.answer && {
      id: request.answer.questionId,
      selected: request.answer.selectedChoiceIds,
    },
    request.flag && { id: request.flag.questionId, flagged: request.flag.flagged },
  ].filter(Boolean) as {
    id: string;
    selected?: readonly string[];
    flagged?: boolean;
  }[];
  updated.questions = updated.questions.map((question) => {
    const change = changes
      .filter((candidate) => candidate.id === question.id)
      .reduce<
        { id: string; selected?: readonly string[]; flagged?: boolean } | undefined
      >((merged, candidate) => ({ ...(merged ?? candidate), ...candidate }), undefined);
    if (!change) return question;
    if (change.selected) validateSelected(question, change.selected);
    return {
      ...question,
      ...(change.selected ? { selectedChoiceIds: [...change.selected] } : {}),
      ...(change.flagged === undefined ? {} : { flagged: change.flagged }),
      savedAt: new Date(now),
      version: question.version + 1n,
    };
  });
  if (
    changes.some(
      (change) => !session.questions.some((question) => question.id === change.id),
    )
  )
    throw domainFailure("not-found");
  return updated;
}
function makePracticeResult(
  session: PracticeSession,
  questionId: string,
  selected: readonly string[],
  earned: Fraction,
  id: string,
  completedAt: Date,
) {
  const questions = session.questions.map((question) =>
    question.id === questionId
      ? {
          ...question,
          selectedChoiceIds: [...selected],
          finalChoiceIds: [...selected],
          earnedScore: earned,
        }
      : question,
  );
  const score = scoreAttempt({
    mode: content(questions[0]!).certification.scoringMode,
    passThreshold: Fraction.parseDecimal(
      content(questions[0]!).certification.passThreshold,
    ),
    questions: questions.map((question) =>
      scoringQuestion(question, question.finalChoiceIds ?? []),
    ),
  });
  const expiresAt = new Date(completedAt.getTime() + RETENTION_MS);
  const first = content(questions[0]!);
  const payload = practiceResultDtoSchema.parse({
    kind: "practice-result",
    resultId: id,
    certification: certification(first),
    score: {
      rawScore: decimal(score.rawScore),
      accuracyRate: decimal(score.accuracyRate),
    },
    domains: domainPerformance(questions),
    questions: questions.map((question) => projectReview(toQuestionSnapshot(question))),
    completedAt: completedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });
  return {
    id,
    rawScore: score.rawScore,
    accuracyRate: score.accuracyRate,
    completedAt,
    expiresAt,
    payload,
  };
}
function certification(value: SnapshotContent) {
  return {
    code: value.certification.code,
    name: value.certification.name,
    scoringMode: value.certification.scoringMode,
    passThreshold: value.certification.passThreshold,
  };
}
function domainPerformance(questions: readonly PersistedQuestionSnapshot[]) {
  const groups = new Map<string, PersistedQuestionSnapshot[]>();
  for (const question of questions) {
    const name = content(question).domainName;
    groups.set(name, [...(groups.get(name) ?? []), question]);
  }
  return [...groups.entries()].map(([domainName, items]) => {
    const earned = items.reduce(
      (sum, item) => sum.add(item.earnedScore ?? Fraction.fromInteger(0n)),
      Fraction.fromInteger(0n),
    );
    return {
      domainName,
      questionCount: items.length,
      earnedScore: decimal(earned),
      accuracyRate: decimal(
        earned
          .divide(Fraction.fromInteger(BigInt(items.length)))
          .multiply(Fraction.fromInteger(100n)),
      ),
    };
  });
}
function projectPracticeSession(session: PracticeSession): PracticeSessionDto {
  const first = content(session.questions[0]!);
  return practiceSessionDtoSchema.parse({
    practiceSessionId: session.id,
    certificationId: first.certification.id,
    certificationCode: first.certification.code,
    certificationName: first.certification.name,
    currentIndex: session.currentIndex,
    stateVersion: version(session.version),
    questions: session.questions.map((question) =>
      question.finalChoiceIds
        ? projectPracticeSubmitted(toQuestionSnapshot(question))
        : projectPracticeUnsubmitted(toQuestionSnapshot(question)),
    ),
  });
}
function projectActiveExam(session: ExamSession, now: Date): ExamActiveSessionDto {
  const first = content(session.questions[0]!);
  return examActiveSessionDtoSchema.parse({
    kind: "exam-active-session",
    examSessionId: session.id,
    certificationId: first.certification.id,
    certificationCode: first.certification.code,
    certificationName: first.certification.name,
    currentIndex: session.currentIndex,
    stateVersion: version(session.version),
    startedAt: session.startedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    serverNow: now.toISOString(),
    remainingSeconds: remainingWholeSeconds(now, session.expiresAt),
    questions: session.questions.map((question) =>
      projectExamActive(toQuestionSnapshot(question)),
    ),
  });
}
async function finalize(
  repos: TransactionRepositories,
  session: ExamSession,
  userId: string,
  reason: "manual" | "expired",
  requestReceivedAt: Date,
  id: string,
): Promise<ExamResultDto> {
  if (session.status === "submitted") {
    const attempt = await repos.history.getAttemptOwned(userId, session.attemptId!);
    if (!attempt) throw domainFailure("dependency-unavailable");
    return projectAttempt(attempt);
  }
  const cutoff = reason === "expired" ? session.expiresAt : requestReceivedAt;
  const questions = session.questions.map((question) => ({
    ...question,
    selectedChoiceIds:
      question.savedAt && question.savedAt <= cutoff ? question.selectedChoiceIds : [],
  }));
  const first = content(questions[0]!);
  const score = scoreAttempt({
    mode: first.certification.scoringMode,
    passThreshold: Fraction.parseDecimal(first.certification.passThreshold),
    questions: questions.map((question) =>
      scoringQuestion(question, question.selectedChoiceIds),
    ),
  });
  const attempt = await repos.exams.finalizeOnce({
    id,
    userId,
    sessionId: session.id,
    rawScore: score.rawScore,
    accuracyRate: score.accuracyRate,
    passThreshold: Fraction.parseDecimal(first.certification.passThreshold),
    passed: score.passed,
    reference1000Score: score.reference1000Score,
    submittedAt: requestReceivedAt,
    submissionReason: reason,
    items: questions,
  });
  if (!attempt) throw domainFailure("not-found");
  return projectAttempt(attempt);
}
function projectAttempt(attempt: Attempt): ExamResultDto {
  const first = content(attempt.items[0]!);
  return examResultDtoSchema.parse({
    kind: "exam-result",
    attemptId: attempt.id,
    examSessionId: attempt.examSessionId,
    certification: certification(first),
    score: {
      rawScore: decimal(attempt.rawScore),
      accuracyRate: decimal(attempt.accuracyRate),
    },
    reference1000Score: attempt.reference1000Score,
    passed: attempt.passed,
    domains: domainPerformance(attempt.items),
    questions: attempt.items.map((item) => projectReview(toQuestionSnapshot(item))),
    startedAt: attempt.startedAt.toISOString(),
    expiresAt: attempt.expiresAt.toISOString(),
    submittedAt: attempt.submittedAt.toISOString(),
    submissionReason: attempt.submissionReason,
  });
}
function summary(attempt: Attempt) {
  const first = content(attempt.items[0]!);
  return {
    attemptId: attempt.id,
    certificationCode: first.certification.code,
    certificationName: first.certification.name,
    rawScore: decimal(attempt.rawScore),
    accuracyRate: decimal(attempt.accuracyRate),
    reference1000Score: attempt.reference1000Score,
    passed: attempt.passed,
    submittedAt: attempt.submittedAt.toISOString(),
  };
}
function compareRepresentative(left: Attempt, right: Attempt) {
  return (
    right.accuracyRate.compare(left.accuracyRate) ||
    left.submittedAt.getTime() - right.submittedAt.getTime() ||
    left.id.localeCompare(right.id)
  );
}
