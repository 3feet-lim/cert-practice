import { readFile } from "node:fs/promises";

import { AuroraDSQLPool } from "@aws/aurora-dsql-node-postgres-connector";

export type DsqlPoolConfig = {
  endpoint: string;
  region: string;
  database?: string;
  user?: string;
  caPath?: string;
  maxConnections?: number;
};

export type DsqlPool = Pick<AuroraDSQLPool, "connect" | "query" | "end">;

/**
 * Creates the IAM-authenticated, TLS-verified connector selected by the live
 * compatibility spike. Pools are intentionally long-lived: Lambda may reuse a
 * module-scoped lifecycle through freeze/thaw, and only deployment shutdown
 * should call close().
 */
export class DsqlPoolLifecycle {
  #pool: AuroraDSQLPool | undefined;
  #creating: Promise<AuroraDSQLPool> | undefined;

  constructor(
    private readonly config: DsqlPoolConfig,
    private readonly createPool: (options: ConstructorParameters<typeof AuroraDSQLPool>[0]) => AuroraDSQLPool =
      (options) => new AuroraDSQLPool(options),
  ) {}

  async pool(): Promise<AuroraDSQLPool> {
    if (this.#pool) return this.#pool;
    this.#creating ??= this.create();
    try {
      this.#pool = await this.#creating;
      return this.#pool;
    } finally {
      this.#creating = undefined;
    }
  }

  async close(): Promise<void> {
    const pool = this.#pool;
    this.#pool = undefined;
    if (pool) await pool.end();
  }

  private async create(): Promise<AuroraDSQLPool> {
    if (!this.config.endpoint || !this.config.region)
      throw new Error("DSQL endpoint and region are required.");
    const ca = this.config.caPath
      ? await readFile(this.config.caPath, "utf8")
      : undefined;
    return this.createPool({
      host: this.config.endpoint,
      port: 5432,
      database: this.config.database ?? "postgres",
      user: this.config.user ?? "admin",
      region: this.config.region,
      ssl: ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true },
      keepAlive: true,
      max: this.config.maxConnections ?? 12,
      idleTimeoutMillis: 600_000,
      maxLifetimeSeconds: 3_300,
      connectionTimeoutMillis: 15_000,
      retry: {
        maxRetries: 8,
        baseDelayMs: 25,
        maxDelayMs: 100,
        jitterFactor: 0.2,
      },
    });
  }
}

/** Lazily creates one pool per Lambda module/composition root. */
export function createDsqlPoolLifecycleFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): DsqlPoolLifecycle {
  return new DsqlPoolLifecycle({
    endpoint: required(environment, "DSQL_ENDPOINT"),
    region: environment.AWS_REGION ?? environment.AWS_DEFAULT_REGION ?? "",
    database: environment.DSQL_DATABASE,
    user: environment.DSQL_USER,
    caPath: environment.PGSSLROOTCERT,
  });
}

function required(environment: NodeJS.ProcessEnv, key: string): string {
  const value = environment[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}
