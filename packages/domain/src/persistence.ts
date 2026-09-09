import type { CatalogGenerationSource, CatalogRevisionSource } from "./catalog.js";
import { Fraction } from "./fraction.js";

/**
 * Aggregate-shaped persistence boundary. These types deliberately contain no
 * SQL rows or transport DTOs so application services can use the same contract
 * with PostgreSQL, DSQL, and deterministic test adapters.
 */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type UserProfile = {
  id: string;
  googleSub: string;
  displayName: string;
  email: string;
  role: "user" | "admin";
  approvalStatus: "pending" | "approved";
  scorePublic: boolean;
  firstLoginAt: Date;
  approvedAt: Date | null;
  version: bigint;
};

export type NewIdentity = {
  id: string;
  googleSub: string;
  displayName: string;
  email: string;
  now: Date;
};

export type CatalogRevision = {
  id: string;
  certificationKey: string;
  contentHash: string;
  importedBy: string;
  importedAt: Date;
  document: JsonValue;
};

export type ImportValidation = {
  id: string;
  actorUserId: string;
  certificationKey: string;
  contentHash: string;
  tokenDigest: string;
  expiresAt: Date;
  status: "validated" | "consumed" | "expired";
  version: bigint;
};

export type PersistedQuestionSnapshot = {
  id: string;
  displayIndex: number;
  content: JsonValue;
  selectedChoiceIds: readonly string[];
  finalChoiceIds: readonly string[] | null;
  earnedScore: Fraction | null;
  flagged: boolean;
  version: bigint;
};

export type PracticeSession = {
  id: string;
  userId: string;
  certificationKey: string;
  status: "active" | "completed";
  currentIndex: number;
  questions: readonly PersistedQuestionSnapshot[];
  resultId: string | null;
  createdAt: Date;
  completedAt: Date | null;
  version: bigint;
};

export type PracticeStateCommand = {
  userId: string;
  sessionId: string;
  expectedVersion: bigint;
  currentIndex: number;
  questionId: string;
  selectedChoiceIds: readonly string[];
  flagged: boolean;
};

export type SubmitPracticeAnswer = {
  userId: string;
  sessionId: string;
  expectedVersion: bigint;
  questionId: string;
  selectedChoiceIds: readonly string[];
  earnedScore: Fraction;
  completedResult?: NewCompletedPracticeResult;
};

export type NewPracticeSession = {
  id: string;
  userId: string;
  certificationKey: string;
  currentIndex: number;
  questions: readonly PersistedQuestionSnapshot[];
  createdAt: Date;
};

export type NewCompletedPracticeResult = {
  id: string;
  rawScore: Fraction;
  accuracyRate: Fraction;
  completedAt: Date;
  expiresAt: Date;
  payload: JsonValue;
};

export type CompletedPracticeResult = NewCompletedPracticeResult & {
  sourcePracticeSessionId: string;
  userId: string;
};

export type PracticeSubmitResult = {
  session: PracticeSession;
  result: CompletedPracticeResult | null;
  firstSubmission: boolean;
};

export type ExamSession = {
  id: string;
  userId: string;
  certificationKey: string;
  startRequestKey: string;
  status: "active" | "submitted";
  currentIndex: number;
  startedAt: Date;
  expiresAt: Date;
  questions: readonly PersistedQuestionSnapshot[];
  attemptId: string | null;
  version: bigint;
};

export type NewExamSession = Omit<ExamSession, "status" | "attemptId" | "version">;

export type SaveExamState = {
  userId: string;
  sessionId: string;
  expectedVersion: bigint;
  currentIndex: number;
  questionId: string;
  selectedChoiceIds: readonly string[];
  flagged: boolean;
  now: Date;
};

export type Attempt = {
  id: string;
  examSessionId: string;
  userId: string;
  certificationKey: string;
  rawScore: Fraction;
  accuracyRate: Fraction;
  passThreshold: Fraction;
  passed: boolean;
  reference1000Score: number;
  submittedAt: Date;
  submissionReason: "manual" | "expired";
  items: readonly PersistedQuestionSnapshot[];
};

export type FinalizeExam = Omit<
  Attempt,
  "examSessionId" | "userId" | "certificationKey" | "items"
> & {
  userId: string;
  sessionId: string;
};

export type ScoreVisibilityUpdate = {
  userId: string;
  scorePublic: boolean;
  expectedVersion: bigint;
};

export interface UserRepository {
  getOrCreatePendingByGoogleSub(input: NewIdentity): Promise<UserProfile>;
  findById(userId: string): Promise<UserProfile | null>;
  findPending(): Promise<readonly UserProfile[]>;
  approvePending(userId: string, approvedAt: Date): Promise<UserProfile | null>;
  updateScoreVisibility(input: ScoreVisibilityUpdate): Promise<UserProfile | null>;
}

export interface CatalogRepository {
  saveValidation(validation: ImportValidation): Promise<void>;
  activateRevision(
    validationId: string,
    revision: CatalogRevision,
    now: Date,
  ): Promise<void>;
  activeRevision(certificationKey: string): Promise<CatalogRevision | null>;
  /** Typed active-head read; callers never receive storage rows or documents. */
  activeCatalogSources(): Promise<readonly CatalogRevisionSource[]>;
  /** A closed, valid source from the selected certification's active revision only. */
  generationSource(certificationId: string): Promise<CatalogGenerationSource | null>;
}

export interface PracticeRepository {
  findActiveOwned(
    userId: string,
    certificationKey: string,
  ): Promise<PracticeSession | null>;
  replaceAtomically(input: NewPracticeSession): Promise<PracticeSession>;
  saveState(command: PracticeStateCommand): Promise<PracticeSession | null>;
  submitFirstAnswer(
    command: SubmitPracticeAnswer,
  ): Promise<PracticeSubmitResult | null>;
  getCompletedOwned(
    userId: string,
    resultId: string,
    now: Date,
  ): Promise<CompletedPracticeResult | null>;
  deleteExpired(cutoffInclusive: Date, batchSize: number): Promise<number>;
}

export interface ExamRepository {
  createWithSnapshots(input: NewExamSession): Promise<ExamSession>;
  getOwned(userId: string, sessionId: string): Promise<ExamSession | null>;
  saveBeforeExpiry(command: SaveExamState): Promise<ExamSession | null>;
  finalizeOnce(command: FinalizeExam): Promise<Attempt | null>;
}

export type TransactionRepositories = {
  users: UserRepository;
  catalog: CatalogRepository;
  practice: PracticeRepository;
  exams: ExamRepository;
};

export interface UnitOfWork {
  transaction<T>(work: (repos: TransactionRepositories) => Promise<T>): Promise<T>;
}
