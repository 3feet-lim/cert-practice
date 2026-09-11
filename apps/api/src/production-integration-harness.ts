import { randomUUID } from "node:crypto";

import {
  createDopC02CatalogFixture,
  createDisposableDsqlSchema,
  DsqlMigrationRunner,
  DsqlPoolLifecycle,
  DsqlUnitOfWork,
  loadApplicationMigrations,
} from "@cert-quiz/db";
import {
  ImportService,
  LifecycleServices,
  SessionFactory,
  type RandomSource,
  type UuidFactory,
  type UserProfile,
} from "@cert-quiz/domain";
import type { Hono } from "hono";

type QueryResultRow = Record<string, unknown>;
type QueryResult<Row extends QueryResultRow = QueryResultRow> = {
  rows: Row[];
  rowCount: number | null;
};
type RawSqlClient = {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>>;
  release(): void;
};
type RawSqlPool = {
  connect(): Promise<RawSqlClient>;
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>>;
};

import { createApp } from "./app.js";
import type { ApiEnvironment } from "./authentication.js";
import { CognitoJwksTokenVerifier } from "./cognito-jwks-verifier.js";
import { createApiSecurityConfiguration } from "./security.js";

const DEFAULT_ISSUER =
  "https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_integration";
const DEFAULT_CLIENT_ID = "cert-quiz-production-integration";
const DEFAULT_NOW = new Date("2026-03-20T12:00:00.000Z");

export type ProductionIntegrationHarnessOptions = Readonly<{
  environment?: Readonly<Record<string, string | undefined>>;
  now?: Date;
  issuer?: string;
  clientId?: string;
}>;

export type ProductionIntegrationHarness = Readonly<{
  app: Hono<ApiEnvironment>;
  unitOfWork: DsqlUnitOfWork;
  database: DisposableSchemaDatabase;
  clock: DeterministicClock;
  ids: DeterministicUuidFactory;
  random: DeterministicRandomSource;
  queries: QueryHooks;
  cognito: LocalCognitoJwks;
  authorization(token: string, init?: RequestInit): RequestInit;
  seedUser(input: SeedUser): Promise<UserProfile>;
  seedDopC02(): Promise<SeededDopC02>;
  reset(): Promise<void>;
  cleanup(): Promise<void>;
}>;

export type SeedUser = Readonly<{
  id?: string;
  googleSub: string;
  displayName?: string;
  email?: string;
  role?: "user" | "admin";
  approvalStatus?: "pending" | "approved";
  scorePublic?: boolean;
}>;

export type SeededDopC02 = Readonly<{
  certificationId: string;
  certificationKey: "DOP-C02";
  revisionId: string;
}>;

/** A controllable server clock shared by JWT verification and lifecycle services. */
export class DeterministicClock {
  #now: Date;

  constructor(now: Date = DEFAULT_NOW) {
    this.#now = copyDate(now);
  }

  now(): Date {
    return copyDate(this.#now);
  }

  set(value: Date): void {
    this.#now = copyDate(value);
  }

  advance(milliseconds: number): void {
    if (!Number.isSafeInteger(milliseconds))
      throw new RangeError("Clock advance must be a safe integer number of milliseconds.");
    this.#now = new Date(this.#now.getTime() + milliseconds);
  }
}

/** Unlimited deterministic UUID source, avoiding accidental fixture exhaustion. */
export class DeterministicUuidFactory implements UuidFactory {
  #next: number;

  constructor(start = 10_000) {
    if (!Number.isSafeInteger(start) || start < 0)
      throw new RangeError("UUID sequence start must be a non-negative safe integer.");
    this.#next = start;
  }

  next(): string {
    const value = this.#next++;
    if (value > 999_999_999_999)
      throw new RangeError("Deterministic UUID sequence is exhausted.");
    return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
  }
}

/** A repeatable RNG with an explicit sequence and a stable zero fallback. */
export class DeterministicRandomSource implements RandomSource {
  #values: number[];

  constructor(values: readonly number[] = []) {
    this.#values = [...values];
  }

  push(...values: number[]): void {
    this.#values.push(...values);
  }

  nextInt(maxExclusive: number): number {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1)
      throw new RangeError("maxExclusive must be a positive safe integer.");
    const next = this.#values.shift() ?? 0;
    if (!Number.isSafeInteger(next) || next < 0 || next >= maxExclusive)
      throw new RangeError(`Deterministic random value ${next} is outside [0, ${maxExclusive}).`);
    return next;
  }
}

export class QueryBarrier {
  #arrivals = 0;
  #release!: () => void;
  readonly #released = new Promise<void>((resolve) => {
    this.#release = resolve;
  });

  constructor(
    private readonly fragment: string,
    private readonly participants: number,
  ) {
    if (!fragment) throw new Error("Query barrier fragment is required.");
    if (!Number.isSafeInteger(participants) || participants < 1)
      throw new RangeError("Query barrier participants must be a positive integer.");
  }

  get arrivals(): number {
    return this.#arrivals;
  }

  async wait(text: string): Promise<void> {
    if (!text.includes(this.fragment) || this.#arrivals >= this.participants) return;
    this.#arrivals += 1;
    if (this.#arrivals === this.participants) this.#release();
    await this.#released;
  }
}

/** Query-level barrier and post-write fault injector for production-table tests. */
export class QueryHooks {
  #barrier: QueryBarrier | undefined;
  #failureFragment: string | undefined;

  barrierBefore(fragment: string, participants: number): QueryBarrier {
    const barrier = new QueryBarrier(fragment, participants);
    this.#barrier = barrier;
    return barrier;
  }

  failAfter(fragment: string): void {
    if (!fragment) throw new Error("Post-write failure fragment is required.");
    this.#failureFragment = fragment;
  }

  reset(): void {
    this.#barrier = undefined;
    this.#failureFragment = undefined;
  }

  async before(text: string): Promise<void> {
    await this.#barrier?.wait(text);
  }

  async after(text: string): Promise<void> {
    if (!this.#failureFragment || !text.includes(this.#failureFragment)) return;
    const fragment = this.#failureFragment;
    this.#failureFragment = undefined;
    throw new Error(`Injected post-write fault after ${fragment}`);
  }
}

export type LocalCognitoJwks = Readonly<{
  issuer: string;
  clientId: string;
  requests: string[];
  jwksUrl: string;
  jwk: JsonWebKey;
  fetch: typeof globalThis.fetch;
  sign(overrides?: Readonly<Record<string, unknown>>): Promise<string>;
}>;

type SigningMaterial = Readonly<{
  kid: string;
  privateKey: CryptoKey;
  jwk: JsonWebKey & Readonly<{ kid: string; alg: "RS256"; use: "sig" }>;
}>;

/**
 * Generates a locally signed Cognito ID-token fixture. Its only network boundary
 * is an injected JWKS fetch function, so production JWT verification remains real.
 */
export async function createLocalCognitoJwks(
  clock: DeterministicClock,
  input: Readonly<{ issuer?: string; clientId?: string; kid?: string }> = {},
): Promise<LocalCognitoJwks> {
  const issuer = input.issuer ?? DEFAULT_ISSUER;
  const clientId = input.clientId ?? DEFAULT_CLIENT_ID;
  const material = await createSigningMaterial(input.kid ?? "production-integration");
  const requests: string[] = [];
  const jwksUrl = "https://jwks.production-integration.test/.well-known/jwks.json";
  const fetch: typeof globalThis.fetch = async (input) => {
    requests.push(String(input));
    return new Response(JSON.stringify({ keys: [material.jwk] }), { status: 200 });
  };

  return Object.freeze({
    issuer,
    clientId,
    requests,
    jwksUrl,
    jwk: material.jwk,
    fetch,
    sign: async (overrides = {}) =>
      signToken(material, {
        iss: issuer,
        aud: clientId,
        token_use: "id",
        exp: Math.floor(clock.now().getTime() / 1_000) + 60,
        identities: JSON.stringify([
          { providerName: "Google", userId: "production-integration-user" },
        ]),
        email: "production-integration@example.test",
        name: "Production integration user",
        ...overrides,
      }),
  });
}

/**
 * Creates an opt-in production composition fixture: a disposable DSQL schema,
 * application migrations, deterministic time/IDs/RNG, local signed Cognito
 * claims, query barriers/faults, and the same Hono services as Lambda uses.
 */
export async function createProductionIntegrationHarness(
  options: ProductionIntegrationHarnessOptions = {},
): Promise<ProductionIntegrationHarness> {
  const environment = options.environment ?? process.env;
  const endpoint = requiredEnvironment(environment, "DSQL_ENDPOINT");
  const region = environment.AWS_REGION ?? environment.AWS_DEFAULT_REGION;
  if (!region)
    throw new Error(
      "Production integration harness requires AWS_REGION or AWS_DEFAULT_REGION.",
    );

  const clock = new DeterministicClock(options.now);
  const ids = new DeterministicUuidFactory();
  const random = new DeterministicRandomSource();
  const cognito = await createLocalCognitoJwks(clock, {
    issuer: options.issuer,
    clientId: options.clientId,
  });
  const queries = new QueryHooks();
  const schema = `production_integration_${randomUUID().replaceAll("-", "")}`;
  const lifecycle = new DsqlPoolLifecycle({
    endpoint,
    region,
    database: environment.DSQL_DATABASE,
    user: environment.DSQL_USER,
    caPath: environment.PGSSLROOTCERT,
  });
  const pool = await lifecycle.pool();
  let disposableSchema: Awaited<ReturnType<typeof createDisposableDsqlSchema>> | undefined;

  try {
    disposableSchema = await createDisposableDsqlSchema(pool, schema);
    const scopedPool = new SchemaScopedPool(pool, disposableSchema.name, queries);
    const database = new DisposableSchemaDatabase(scopedPool);
    const migrations = await loadApplicationMigrations();
    await new DsqlMigrationRunner(database, { now: () => clock.now() }).migrate(migrations);
    const unitOfWork = new DsqlUnitOfWork(
      scopedPool as unknown as ConstructorParameters<typeof DsqlUnitOfWork>[0],
      {
      retryDelayMs: 10,
    });
    const sessionFactory = new SessionFactory({ ids, random, now: () => clock.now() });
    const services = new LifecycleServices({
      unitOfWork,
      sessionFactory,
      now: () => clock.now(),
      createId: () => ids.next(),
    });
    const importService = new ImportService({
      ids,
      random,
      now: () => clock.now(),
    });
    const app = createApp(
      {
        tokenVerifier: new CognitoJwksTokenVerifier({
          issuer: cognito.issuer,
          clientId: cognito.clientId,
          tokenUse: "id",
          jwksUrl: cognito.jwksUrl,
          now: () => clock.now(),
          fetch: cognito.fetch,
        }),
        unitOfWork,
        now: () => clock.now(),
        createUserId: () => ids.next(),
        lifecycle: services,
        importService,
      },
      createApiSecurityConfiguration({
        stage: "dev",
        allowedOrigins: ["http://localhost"],
        markdownImageOrigins: [],
        hstsEnabled: false,
      }),
    );

    const harness: ProductionIntegrationHarness = {
      app,
      unitOfWork,
      database,
      clock,
      ids,
      random,
      queries,
      cognito,
      authorization: (token, init = {}) => ({
        ...init,
        headers: { authorization: `Bearer ${token}`, ...init.headers },
      }),
      seedUser: (input) => seedUser(unitOfWork, database, clock, ids, input),
      seedDopC02: () => seedDopC02(database, clock),
      reset: async () => {
        queries.reset();
        await resetApplicationData(database);
      },
      cleanup: async () => {
        try {
          await disposableSchema?.cleanup();
        } finally {
          await lifecycle.close();
        }
      },
    };
    return Object.freeze(harness);
  } catch (error) {
    try {
      await disposableSchema?.cleanup();
    } finally {
      await lifecycle.close();
    }
    throw error;
  }
}

export class DisposableSchemaDatabase {
  constructor(private readonly pool: SchemaScopedPool) {}

  async query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Row[]; rowCount: number | null }> {
    const client = await this.pool.connect();
    try {
      return await client.query<Row>(text, values);
    } finally {
      client.release();
    }
  }
}

class SchemaScopedPool {
  constructor(
    private readonly pool: RawSqlPool,
    private readonly schema: string,
    private readonly hooks: QueryHooks,
  ) {}

  async connect(): Promise<RawSqlClient> {
    const client = await this.pool.connect();
    try {
      await client.query(`SET search_path TO ${quoteIdentifier(this.schema)}`);
      return {
        query: async (text: string, values?: readonly unknown[]) => {
          await this.hooks.before(text);
          const result = await client.query(text, values);
          await this.hooks.after(text);
          return result;
        },
        release: () => client.release(),
      } as RawSqlClient;
    } catch (error) {
      client.release();
      throw error;
    }
  }
}

async function seedUser(
  unitOfWork: DsqlUnitOfWork,
  database: DisposableSchemaDatabase,
  clock: DeterministicClock,
  ids: DeterministicUuidFactory,
  input: SeedUser,
): Promise<UserProfile> {
  const id = input.id ?? ids.next();
  const requiresApproval =
    input.approvalStatus === "approved" || input.scorePublic === true || input.role === "admin";
  const profile = await unitOfWork.transaction(async (repositories) => {
    const created = await repositories.users.getOrCreatePendingByGoogleSub({
      id,
      googleSub: input.googleSub,
      displayName: input.displayName ?? input.googleSub,
      email: input.email ?? `${input.googleSub}@example.test`,
      now: clock.now(),
    });
    const approved = requiresApproval
      ? await repositories.users.approvePending(created.id, clock.now())
      : created;
    if (!approved) throw new Error("Failed to seed the requested user.");
    const visible =
      input.scorePublic === undefined
        ? approved
        : await repositories.users.updateScoreVisibility({
            userId: approved.id,
            scorePublic: input.scorePublic,
            expectedVersion: approved.version,
          });
    if (!visible) throw new Error("Failed to seed user score visibility.");
    return visible;
  });
  if (input.role !== "admin") return profile;

  // Roles are not mutable through product APIs. The fixture makes an approved
  // admin only after the normal profile lifecycle has established invariants.
  await database.query("UPDATE user_profiles SET role = 'admin' WHERE id = $1", [
    profile.id,
  ]);
  const seeded = await unitOfWork.transaction((repositories) =>
    repositories.users.findById(profile.id),
  );
  if (!seeded) throw new Error("Failed to load the seeded admin profile.");
  return seeded;
}

async function seedDopC02(
  database: DisposableSchemaDatabase,
  clock: DeterministicClock,
): Promise<SeededDopC02> {
  const fixture = createDopC02CatalogFixture();
  const certification = fixture.source.certifications[0];
  const provider = fixture.source.providers[0];
  if (!certification || !provider) throw new Error("DOP-C02 fixture is incomplete.");

  await database.query(
    `INSERT INTO user_profiles
       (id, google_sub, display_name, email, role, approval_status, score_public,
        first_login_at, approved_at, created_at, updated_at, version)
     VALUES ($1, 'dop-c02-fixture-importer', 'Fixture importer', 'fixture-importer@example.test',
             'admin', 'approved', false, $2, $2, $2, $2, 0)
     ON CONFLICT (id) DO NOTHING`,
    [fixture.revision.importedBy, clock.now()],
  );
  await database.query(
    `INSERT INTO catalog_revisions
       (id, certification_key, content_hash, imported_by, imported_at, status)
     VALUES ($1, $2, $3, $4, $5, 'active')`,
    [
      fixture.revision.id,
      fixture.revision.certificationKey,
      fixture.revision.contentHash,
      fixture.revision.importedBy,
      clock.now(),
    ],
  );
  await database.query(
    `INSERT INTO providers (id, revision_id, external_key, name, logo_url)
     VALUES ($1, $2, $3, $4, $5)`,
    [provider.id, fixture.revision.id, provider.id, provider.name, provider.logoUrl],
  );
  await database.query(
    `INSERT INTO certifications
       (id, revision_id, provider_id, external_key, code, name, total_questions,
        time_limit_minutes, threshold_numerator, threshold_denominator, scoring_mode)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      certification.id,
      fixture.revision.id,
      provider.id,
      certification.externalKey,
      certification.code,
      certification.name,
      certification.totalQuestions,
      certification.timeLimitMinutes,
      certification.passThreshold.numerator.toString(),
      certification.passThreshold.denominator.toString(),
      certification.scoringMode,
    ],
  );
  for (const domain of fixture.source.domains)
    await database.query(
      `INSERT INTO domains
         (id, revision_id, certification_id, external_key, name, weight_basis_points, order_index)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        domain.id,
        fixture.revision.id,
        certification.id,
        domain.id,
        domain.name,
        domain.weightBasisPoints,
        domain.orderIndex,
      ],
    );
  for (const [index, question] of fixture.source.questions.entries()) {
    const choiceId = deterministicChoiceId(index);
    await database.query(
      `INSERT INTO questions
         (id, revision_id, certification_id, domain_id, external_key, stem_en, stem_ko,
          explanation_en, explanation_ko, translation_status, required_choice_count)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, NULL, 'en_only', 1)`,
      [
        question.id,
        fixture.revision.id,
        certification.id,
        question.domainId,
        `dop-c02-question-${index + 1}`,
        `DOP-C02 fixture question ${index + 1}`,
        `DOP-C02 fixture explanation ${index + 1}`,
      ],
    );
    await database.query(
      `INSERT INTO choices
         (id, revision_id, question_id, external_key, text_en, text_ko, order_index, is_correct)
       VALUES ($1, $2, $3, 'correct', 'Correct answer', NULL, 0, true)`,
      [choiceId, fixture.revision.id, question.id],
    );
  }
  await database.query(
    `INSERT INTO catalog_heads (certification_key, active_revision_id, updated_at, version)
     VALUES ($1, $2, $3, 0)`,
    [fixture.revision.certificationKey, fixture.revision.id, clock.now()],
  );
  return Object.freeze({
    certificationId: certification.id,
    certificationKey: "DOP-C02",
    revisionId: fixture.revision.id,
  });
}

async function resetApplicationData(database: DisposableSchemaDatabase): Promise<void> {
  await database.query(`TRUNCATE TABLE
    attempt_items,
    attempts,
    exam_session_questions,
    exam_sessions,
    completed_practice_items,
    completed_practice_results,
    practice_session_questions,
    practice_sessions,
    import_validations,
    choices,
    questions,
    domains,
    certifications,
    providers,
    catalog_heads,
    catalog_revisions,
    user_profiles`);
}

function deterministicChoiceId(index: number): string {
  return `00000000-0000-4000-9000-${String(index + 1).padStart(12, "0")}`;
}

async function createSigningMaterial(kid: string): Promise<SigningMaterial> {
  const keyPair = (await globalThis.crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const jwk = await globalThis.crypto.subtle.exportKey("jwk", keyPair.publicKey);
  return {
    kid,
    privateKey: keyPair.privateKey,
    jwk: { ...jwk, kid, alg: "RS256", use: "sig" } as JsonWebKey &
      Readonly<{ kid: string; alg: "RS256"; use: "sig" }>,
  };
}

async function signToken(
  material: SigningMaterial,
  payload: Readonly<Record<string, unknown>>,
): Promise<string> {
  const header = encodeJson({ alg: "RS256", kid: material.kid, typ: "JWT" });
  const body = encodeJson(payload);
  const signedContent = `${header}.${body}`;
  const signature = await globalThis.crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    material.privateKey,
    new TextEncoder().encode(signedContent),
  );
  return `${signedContent}.${encodeBytes(new Uint8Array(signature))}`;
}

function encodeJson(value: unknown): string {
  return encodeBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function encodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/u.test(identifier))
    throw new Error("Invalid disposable DSQL schema identifier.");
  return `\"${identifier}\"`;
}

function requiredEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
  key: string,
): string {
  const value = environment[key];
  if (!value)
    throw new Error(
      `Production integration harness requires ${key}; provide a reachable Aurora DSQL endpoint.`,
    );
  return value;
}

function copyDate(value: Date): Date {
  return new Date(value.getTime());
}
