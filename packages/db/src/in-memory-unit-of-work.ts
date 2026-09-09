import { constantTimeEqual, findGenerationSource } from "@cert-quiz/domain";
import type {
  Attempt,
  CatalogGenerationSource,
  CatalogRepository,
  CatalogRevision,
  CatalogRevisionSource,
  CompletedPracticeResult,
  ExamRepository,
  ExamSession,
  FinalizeExam,
  FullCatalogGenerationSource,
  ImportValidation,
  NewCompletedPracticeResult,
  NewExamSession,
  NewIdentity,
  NewPracticeSession,
  PracticeRepository,
  PracticeSession,
  PersistedQuestionSnapshot,
  SaveExamState,
  TransactionRepositories,
  UnitOfWork,
  UserProfile,
  UserRepository,
} from "@cert-quiz/domain";

export type InMemoryFaultPoint =
  | "profile-write"
  | "approval-write"
  | "practice-replace"
  | "practice-submit"
  | "exam-finalize"
  | "catalog-switch";

type State = {
  users: Map<string, UserProfile>;
  userIdsByGoogleSub: Map<string, string>;
  validations: Map<string, ImportValidation>;
  revisions: Map<string, CatalogRevision>;
  catalogSources: Map<string, CatalogRevisionSource>;
  fullGenerationSources: Map<string, FullCatalogGenerationSource>;
  heads: Map<string, string>;
  practices: Map<string, PracticeSession>;
  results: Map<string, CompletedPracticeResult>;
  exams: Map<string, ExamSession>;
  examIdsByRequest: Map<string, string>;
  attempts: Map<string, Attempt>;
  attemptIdsByExam: Map<string, string>;
};

const emptyState = (): State => ({
  users: new Map(),
  userIdsByGoogleSub: new Map(),
  validations: new Map(),
  revisions: new Map(),
  catalogSources: new Map(),
  fullGenerationSources: new Map(),
  heads: new Map(),
  practices: new Map(),
  results: new Map(),
  exams: new Map(),
  examIdsByRequest: new Map(),
  attempts: new Map(),
  attemptIdsByExam: new Map(),
});

/**
 * Serial, copy-on-write UnitOfWork used by repository contract tests. It models
 * transaction rollback and all business uniqueness constraints without a SQL
 * driver. The implementation is intentionally an adapter, not a domain import.
 */
export class InMemoryUnitOfWork implements UnitOfWork {
  #state = emptyState();
  #tail: Promise<void> = Promise.resolve();
  #faults = new Set<InMemoryFaultPoint>();

  failNext(point: InMemoryFaultPoint): void {
    this.#faults.add(point);
  }

  /** Seeds a profile for deterministic offline adapter and route tests. */
  seedUser(profile: UserProfile): void {
    if (this.#state.users.has(profile.id))
      throw new Error("Seed user ID must be unique.");
    if (this.#state.userIdsByGoogleSub.has(profile.googleSub))
      throw new Error("Seed Google subject must be unique.");
    this.#state.users.set(profile.id, copyUser(profile));
    this.#state.userIdsByGoogleSub.set(profile.googleSub, profile.id);
  }

  /** Seeds a typed revision fixture for offline tests without a database connection. */
  seedCatalogSource(
    source: CatalogRevisionSource,
    revision: CatalogRevision,
    active = true,
  ): void {
    if (source.revisionId !== revision.id)
      throw new Error("Catalog source and revision IDs must match.");
    if (source.certificationKey !== revision.certificationKey)
      throw new Error("Catalog source and revision keys must match.");
    if (this.#state.catalogSources.has(source.revisionId))
      throw new Error("Seed catalog revision ID must be unique.");
    this.#state.catalogSources.set(source.revisionId, copyCatalogSource(source));
    this.#state.revisions.set(revision.id, copyRevision(revision));
    if (active) this.#state.heads.set(source.certificationKey, source.revisionId);
  }

  async transaction<T>(
    work: (repos: TransactionRepositories) => Promise<T>,
  ): Promise<T> {
    const previous = this.#tail;
    let release!: () => void;
    this.#tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const working = copyState(this.#state);
    try {
      const value = await work(new InMemoryRepositories(working, this.#faults));
      this.#state = working;
      return value;
    } finally {
      release();
    }
  }
}

class InMemoryRepositories implements TransactionRepositories {
  readonly users: UserRepository;
  readonly catalog: CatalogRepository;
  readonly practice: PracticeRepository;
  readonly exams: ExamRepository;

  constructor(
    private readonly state: State,
    private readonly faults: Set<InMemoryFaultPoint>,
  ) {
    this.users = this.userRepository();
    this.catalog = this.catalogRepository();
    this.practice = this.practiceRepository();
    this.exams = this.examRepository();
  }

  private fault(point: InMemoryFaultPoint): void {
    if (this.faults.delete(point))
      throw new Error(`Injected persistence fault: ${point}`);
  }

  private userRepository(): UserRepository {
    return {
      getOrCreatePendingByGoogleSub: async (input: NewIdentity) => {
        const existingId = this.state.userIdsByGoogleSub.get(input.googleSub);
        if (existingId) {
          const existing = required(this.state.users.get(existingId), "profile");
          if (
            existing.displayName === input.displayName &&
            existing.email === input.email
          )
            return copyUser(existing);
          const updated = {
            ...existing,
            displayName: input.displayName,
            email: input.email,
            version: existing.version + 1n,
          };
          this.state.users.set(updated.id, updated);
          this.fault("profile-write");
          return copyUser(updated);
        }
        const profile: UserProfile = {
          id: input.id,
          googleSub: input.googleSub,
          displayName: input.displayName,
          email: input.email,
          role: "user",
          approvalStatus: "pending",
          scorePublic: false,
          firstLoginAt: copyDate(input.now),
          approvedAt: null,
          version: 0n,
        };
        this.state.users.set(profile.id, profile);
        this.state.userIdsByGoogleSub.set(profile.googleSub, profile.id);
        this.fault("profile-write");
        return copyUser(profile);
      },
      findById: async (userId) => {
        const profile = this.state.users.get(userId);
        return profile ? copyUser(profile) : null;
      },
      findPending: async () =>
        [...this.state.users.values()]
          .filter((profile) => profile.approvalStatus === "pending")
          .sort((left, right) =>
            compareDateThenId(left.firstLoginAt, left.id, right.firstLoginAt, right.id),
          )
          .map(copyUser),
      approvePending: async (userId, approvedAt) => {
        const profile = this.state.users.get(userId);
        if (!profile) return null;
        if (profile.approvalStatus === "approved") return copyUser(profile);
        const approved: UserProfile = {
          ...profile,
          approvalStatus: "approved",
          approvedAt: copyDate(approvedAt),
          version: profile.version + 1n,
        };
        this.state.users.set(userId, approved);
        this.fault("approval-write");
        return copyUser(approved);
      },
      updateScoreVisibility: async ({ userId, scorePublic, expectedVersion }) => {
        const profile = this.state.users.get(userId);
        if (
          !profile ||
          profile.approvalStatus !== "approved" ||
          profile.version !== expectedVersion
        )
          return null;
        const updated = {
          ...profile,
          scorePublic,
          version: profile.version + 1n,
        };
        this.state.users.set(userId, updated);
        return copyUser(updated);
      },
    };
  }

  private catalogRepository(): CatalogRepository {
    return {
      saveValidation: async (validation) => {
        if (
          [...this.state.validations.values()].some(
            (item) => item.tokenDigest === validation.tokenDigest,
          )
        ) {
          throw new Error("Import token digest must be unique.");
        }
        this.state.validations.set(validation.id, copyValidation(validation));
      },
      activateRevision: async (validationId, revision, now) => {
        const validation = this.state.validations.get(validationId);
        if (
          !validation ||
          validation.status !== "validated" ||
          validation.expiresAt <= now
        ) {
          throw new Error("Import validation is not consumable.");
        }
        if (validation.contentHash !== revision.contentHash)
          throw new Error("Import content hash mismatch.");
        this.state.revisions.set(revision.id, copyRevision(revision));
        this.state.heads.set(revision.certificationKey, revision.id);
        this.state.validations.set(validation.id, {
          ...validation,
          status: "consumed",
          version: validation.version + 1n,
        });
        this.fault("catalog-switch");
      },
      commitValidatedImport: async ({
        validationId,
        actorUserId,
        tokenDigest,
        contentHash,
        materialization,
        now,
      }) => {
        const validation = this.state.validations.get(validationId);
        if (
          !validation ||
          validation.status !== "validated" ||
          validation.expiresAt <= now ||
          validation.actorUserId !== actorUserId ||
          !constantTimeEqual(validation.tokenDigest, tokenDigest) ||
          !constantTimeEqual(validation.contentHash, contentHash)
        ) {
          throw new Error("Import validation is not consumable.");
        }
        const { revision, source, generation } = materialization;
        if (
          revision.certificationKey !== validation.certificationKey ||
          revision.contentHash !== validation.contentHash ||
          revision.importedBy !== actorUserId ||
          source.revisionId !== revision.id ||
          source.certificationKey !== revision.certificationKey ||
          generation.revisionId !== revision.id ||
          generation.certification.id !== source.certifications[0]?.id ||
          generation.questions.length !== source.questions.length
        ) {
          throw new Error("Import materialization is invalid.");
        }
        const valid = findGenerationSource([source], generation.certification.id);
        if (!valid)
          throw new Error("Import materialization cannot generate a session.");
        this.state.revisions.set(revision.id, copyRevision(revision));
        this.state.catalogSources.set(revision.id, copyCatalogSource(source));
        this.state.fullGenerationSources.set(
          revision.id,
          copyFullGenerationSource(generation),
        );
        this.state.heads.set(revision.certificationKey, revision.id);
        this.state.validations.set(validation.id, {
          ...validation,
          status: "consumed",
          version: validation.version + 1n,
        });
        this.fault("catalog-switch");
      },
      activeRevision: async (certificationKey) => {
        const revisionId = this.state.heads.get(certificationKey);
        return revisionId
          ? copyRevision(required(this.state.revisions.get(revisionId), "revision"))
          : null;
      },
      activeCatalogSources: async () =>
        [...this.state.heads.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .flatMap(([, revisionId]) => {
            const source = this.state.catalogSources.get(revisionId);
            return source ? [copyCatalogSource(source)] : [];
          }),
      generationSource: async (
        certificationId,
      ): Promise<CatalogGenerationSource | null> =>
        findGenerationSource(
          [...this.state.heads.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .flatMap(([, revisionId]) => {
              const source = this.state.catalogSources.get(revisionId);
              return source ? [copyCatalogSource(source)] : [];
            }),
          certificationId,
        ),
      fullGenerationSource: async (certificationId) => {
        for (const [, revisionId] of [...this.state.heads.entries()].sort(
          ([left], [right]) => left.localeCompare(right),
        )) {
          const source = this.state.catalogSources.get(revisionId);
          const full = this.state.fullGenerationSources.get(revisionId);
          if (!source || !full) continue;
          const publicGeneration = findGenerationSource([source], certificationId);
          if (publicGeneration && full.certification.id === certificationId)
            return copyFullGenerationSource(full);
        }
        return null;
      },
    };
  }

  private practiceRepository(): PracticeRepository {
    return {
      findActiveOwned: async (userId, certificationKey) => {
        const session = [...this.state.practices.values()].find(
          (candidate) =>
            candidate.userId === userId &&
            candidate.certificationKey === certificationKey &&
            candidate.status === "active",
        );
        return session ? copyPractice(session) : null;
      },
      replaceAtomically: async (input) => {
        for (const session of this.state.practices.values()) {
          if (
            session.userId === input.userId &&
            session.certificationKey === input.certificationKey &&
            session.status === "active"
          ) {
            this.state.practices.delete(session.id);
          }
        }
        const created = toPractice(input);
        this.state.practices.set(created.id, created);
        this.fault("practice-replace");
        return copyPractice(created);
      },
      saveState: async (command) => {
        const session = this.ownedActivePractice(command.userId, command.sessionId);
        if (!session || session.version !== command.expectedVersion) return null;
        const question = session.questions.find(
          (item) => item.id === command.questionId,
        );
        if (!question || question.finalChoiceIds) return null;
        const updated = copyPractice(session);
        updated.currentIndex = command.currentIndex;
        updated.questions = updated.questions.map((item) =>
          item.id === command.questionId
            ? {
                ...item,
                selectedChoiceIds: [...command.selectedChoiceIds],
                flagged: command.flagged,
                version: item.version + 1n,
              }
            : item,
        );
        updated.version += 1n;
        this.state.practices.set(updated.id, updated);
        return copyPractice(updated);
      },
      submitFirstAnswer: async (command) => {
        const session = this.state.practices.get(command.sessionId);
        if (!session || session.userId !== command.userId) return null;
        const question = session.questions.find(
          (item) => item.id === command.questionId,
        );
        if (!question) return null;
        if (question.finalChoiceIds) {
          return {
            session: copyPractice(session),
            result: this.resultFor(session, command.userId),
            firstSubmission: false,
          };
        }
        if (session.status !== "active" || session.version !== command.expectedVersion)
          return null;
        const updated = copyPractice(session);
        updated.questions = updated.questions.map((item) =>
          item.id === command.questionId
            ? {
                ...item,
                selectedChoiceIds: [...command.selectedChoiceIds],
                finalChoiceIds: [...command.selectedChoiceIds],
                earnedScore: command.earnedScore,
                version: item.version + 1n,
              }
            : item,
        );
        updated.version += 1n;
        let result: CompletedPracticeResult | null = null;
        if (updated.questions.every((item) => item.finalChoiceIds !== null)) {
          if (!command.completedResult)
            throw new Error("Final practice submission requires a completed result.");
          result = toCompletedResult(
            command.completedResult,
            updated.id,
            updated.userId,
          );
          if (
            this.state.results.has(result.id) ||
            [...this.state.results.values()].some(
              (item) => item.sourcePracticeSessionId === updated.id,
            )
          ) {
            throw new Error("Practice session already has a completed result.");
          }
          updated.status = "completed";
          updated.resultId = result.id;
          updated.completedAt = copyDate(result.completedAt);
          this.state.results.set(result.id, result);
        }
        this.state.practices.set(updated.id, updated);
        this.fault("practice-submit");
        return {
          session: copyPractice(updated),
          result: result && copyResult(result),
          firstSubmission: true,
        };
      },
      getCompletedOwned: async (userId, resultId, now) => {
        const result = this.state.results.get(resultId);
        if (!result || result.userId !== userId || result.expiresAt <= now) return null;
        return copyResult(result);
      },
      deleteExpired: async (cutoffInclusive, batchSize) => {
        const expired = [...this.state.results.values()]
          .filter((result) => result.expiresAt <= cutoffInclusive)
          .sort((left, right) =>
            compareDateThenId(left.expiresAt, left.id, right.expiresAt, right.id),
          )
          .slice(0, batchSize);
        for (const result of expired) this.state.results.delete(result.id);
        return expired.length;
      },
    };
  }

  private examRepository(): ExamRepository {
    return {
      createWithSnapshots: async (input: NewExamSession) => {
        const key = `${input.userId}\u0000${input.startRequestKey}`;
        const existingId = this.state.examIdsByRequest.get(key);
        if (existingId)
          return copyExam(required(this.state.exams.get(existingId), "exam"));
        const exam: ExamSession = {
          ...copyNewExam(input),
          status: "active",
          attemptId: null,
          version: 0n,
        };
        this.state.exams.set(exam.id, exam);
        this.state.examIdsByRequest.set(key, exam.id);
        return copyExam(exam);
      },
      getOwned: async (userId, sessionId) => {
        const session = this.state.exams.get(sessionId);
        return session?.userId === userId ? copyExam(session) : null;
      },
      saveBeforeExpiry: async (command: SaveExamState) => {
        const session = this.ownedExam(command.userId, command.sessionId);
        if (
          !session ||
          session.version !== command.expectedVersion ||
          session.expiresAt <= command.now
        )
          return null;
        const question = session.questions.find(
          (item) => item.id === command.questionId,
        );
        if (!question) return null;
        const updated = copyExam(session);
        updated.currentIndex = command.currentIndex;
        updated.questions = updated.questions.map((item) =>
          item.id === command.questionId
            ? {
                ...item,
                selectedChoiceIds: [...command.selectedChoiceIds],
                flagged: command.flagged,
                version: item.version + 1n,
              }
            : item,
        );
        updated.version += 1n;
        this.state.exams.set(updated.id, updated);
        return copyExam(updated);
      },
      finalizeOnce: async (command: FinalizeExam) => {
        const session = this.ownedExam(command.userId, command.sessionId);
        if (!session) return null;
        if (session.status === "submitted") {
          return session.attemptId
            ? copyAttempt(
                required(this.state.attempts.get(session.attemptId), "attempt"),
              )
            : null;
        }
        const attempt: Attempt = {
          ...copyAttemptInput(command),
          examSessionId: session.id,
          userId: session.userId,
          certificationKey: session.certificationKey,
          items: session.questions.map(copyQuestion),
        };
        const existingAttemptId = this.state.attemptIdsByExam.get(session.id);
        if (existingAttemptId)
          return copyAttempt(
            required(this.state.attempts.get(existingAttemptId), "attempt"),
          );
        this.state.attempts.set(attempt.id, attempt);
        this.state.attemptIdsByExam.set(session.id, attempt.id);
        this.state.exams.set(session.id, {
          ...session,
          status: "submitted",
          attemptId: attempt.id,
          version: session.version + 1n,
        });
        this.fault("exam-finalize");
        return copyAttempt(attempt);
      },
    };
  }

  private ownedActivePractice(
    userId: string,
    sessionId: string,
  ): PracticeSession | null {
    const session = this.state.practices.get(sessionId);
    return session?.userId === userId && session.status === "active" ? session : null;
  }

  private ownedExam(userId: string, sessionId: string): ExamSession | null {
    const session = this.state.exams.get(sessionId);
    return session?.userId === userId ? session : null;
  }

  private resultFor(
    session: PracticeSession,
    userId: string,
  ): CompletedPracticeResult | null {
    if (!session.resultId || session.userId !== userId) return null;
    return copyResult(required(this.state.results.get(session.resultId), "result"));
  }
}

function toPractice(input: NewPracticeSession): PracticeSession {
  return {
    ...input,
    questions: input.questions.map(copyQuestion),
    status: "active",
    resultId: null,
    completedAt: null,
    version: 0n,
    createdAt: copyDate(input.createdAt),
  };
}
function toCompletedResult(
  input: NewCompletedPracticeResult,
  sourcePracticeSessionId: string,
  userId: string,
): CompletedPracticeResult {
  return {
    ...input,
    sourcePracticeSessionId,
    userId,
    completedAt: copyDate(input.completedAt),
    expiresAt: copyDate(input.expiresAt),
  };
}
function copyState(state: State): State {
  return {
    users: new Map([...state.users].map(([id, item]) => [id, copyUser(item)])),
    userIdsByGoogleSub: new Map(state.userIdsByGoogleSub),
    validations: new Map(
      [...state.validations].map(([id, item]) => [id, copyValidation(item)]),
    ),
    revisions: new Map(
      [...state.revisions].map(([id, item]) => [id, copyRevision(item)]),
    ),
    catalogSources: new Map(
      [...state.catalogSources].map(([id, item]) => [id, copyCatalogSource(item)]),
    ),
    fullGenerationSources: new Map(
      [...state.fullGenerationSources].map(([id, item]) => [
        id,
        copyFullGenerationSource(item),
      ]),
    ),
    heads: new Map(state.heads),
    practices: new Map(
      [...state.practices].map(([id, item]) => [id, copyPractice(item)]),
    ),
    results: new Map([...state.results].map(([id, item]) => [id, copyResult(item)])),
    exams: new Map([...state.exams].map(([id, item]) => [id, copyExam(item)])),
    examIdsByRequest: new Map(state.examIdsByRequest),
    attempts: new Map([...state.attempts].map(([id, item]) => [id, copyAttempt(item)])),
    attemptIdsByExam: new Map(state.attemptIdsByExam),
  };
}
function copyUser(item: UserProfile): UserProfile {
  return {
    ...item,
    firstLoginAt: copyDate(item.firstLoginAt),
    approvedAt: item.approvedAt && copyDate(item.approvedAt),
  };
}
function copyValidation(item: ImportValidation): ImportValidation {
  return { ...item, expiresAt: copyDate(item.expiresAt) };
}
function copyRevision(item: CatalogRevision): CatalogRevision {
  return {
    ...item,
    importedAt: copyDate(item.importedAt),
    document: structuredClone(item.document),
  };
}
function copyCatalogSource(item: CatalogRevisionSource): CatalogRevisionSource {
  return {
    revisionId: item.revisionId,
    certificationKey: item.certificationKey,
    providers: item.providers.map((provider) => ({ ...provider })),
    certifications: item.certifications.map((certification) => ({
      ...certification,
      passThreshold: certification.passThreshold,
    })),
    domains: item.domains.map((domain) => ({ ...domain })),
    questions: item.questions.map((question) => ({ ...question })),
  };
}
function copyFullGenerationSource(
  item: FullCatalogGenerationSource,
): FullCatalogGenerationSource {
  return {
    revisionId: item.revisionId,
    certification: {
      ...item.certification,
      passThreshold: item.certification.passThreshold,
    },
    provider: { ...item.provider },
    domains: item.domains.map((domain) => ({ ...domain })),
    questions: item.questions.map((question) => ({
      ...question,
      stem: { ...question.stem },
      explanation: { ...question.explanation },
      choices: question.choices.map((choice) => ({
        ...choice,
        text: { ...choice.text },
      })),
      correctChoiceIndexes: [...question.correctChoiceIndexes],
    })),
  };
}
function copyQuestion(item: PersistedQuestionSnapshot): PersistedQuestionSnapshot {
  return {
    ...item,
    content: structuredClone(item.content),
    selectedChoiceIds: [...item.selectedChoiceIds],
    finalChoiceIds: item.finalChoiceIds && [...item.finalChoiceIds],
  };
}
function copyPractice(item: PracticeSession): PracticeSession {
  return {
    ...item,
    questions: item.questions.map(copyQuestion),
    createdAt: copyDate(item.createdAt),
    completedAt: item.completedAt && copyDate(item.completedAt),
  };
}
function copyResult(item: CompletedPracticeResult): CompletedPracticeResult {
  return {
    ...item,
    completedAt: copyDate(item.completedAt),
    expiresAt: copyDate(item.expiresAt),
    payload: structuredClone(item.payload),
  };
}
function copyExam(item: ExamSession): ExamSession {
  return {
    ...item,
    questions: item.questions.map(copyQuestion),
    startedAt: copyDate(item.startedAt),
    expiresAt: copyDate(item.expiresAt),
  };
}
function copyNewExam(item: NewExamSession): NewExamSession {
  return {
    ...item,
    questions: item.questions.map(copyQuestion),
    startedAt: copyDate(item.startedAt),
    expiresAt: copyDate(item.expiresAt),
  };
}
function copyAttempt(item: Attempt): Attempt {
  return {
    ...item,
    submittedAt: copyDate(item.submittedAt),
    items: item.items.map(copyQuestion),
  };
}
function copyAttemptInput(
  item: FinalizeExam,
): Omit<Attempt, "examSessionId" | "userId" | "certificationKey" | "items"> {
  return { ...item, submittedAt: copyDate(item.submittedAt) };
}
function copyDate(value: Date): Date {
  return new Date(value.getTime());
}
function compareDateThenId(
  left: Date,
  leftId: string,
  right: Date,
  rightId: string,
): number {
  return left.getTime() - right.getTime() || leftId.localeCompare(rightId);
}
function required<T>(value: T | undefined, name: string): T {
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}
