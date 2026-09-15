import { describe, expect, it, vi } from "vitest";

import { provisionApplicationDatabaseRole } from "./migrate.js";

const roleArn = "arn:aws:iam::370489250264:role/certquiz-dev-api-lambda-execution";

function fakeQueryable(overrides: {
  roleExists?: boolean;
  mappingExists?: boolean;
}) {
  const query = vi.fn(async (text: string) => {
    if (text.startsWith("SELECT 1 FROM pg_roles")) {
      return { rows: overrides.roleExists ? [{ "?column?": 1 }] : [], rowCount: null };
    }
    if (text.startsWith("SELECT 1 FROM sys.iam_pg_role_mappings")) {
      return {
        rows: overrides.mappingExists ? [{ "?column?": 1 }] : [],
        rowCount: null,
      };
    }
    return { rows: [], rowCount: null };
  });
  return { query };
}

function statementsOf(database: { query: ReturnType<typeof vi.fn> }): string[] {
  return database.query.mock.calls.map(([text]) => text as string);
}

describe("provisionApplicationDatabaseRole", () => {
  it("creates the database role when it does not already exist", async () => {
    const database = fakeQueryable({ roleExists: false, mappingExists: true });
    await provisionApplicationDatabaseRole(database, { roleName: "app", iamRoleArn: roleArn });
    expect(statementsOf(database)).toContain("CREATE ROLE app WITH LOGIN");
  });

  it("skips CREATE ROLE when the database role already exists", async () => {
    const database = fakeQueryable({ roleExists: true, mappingExists: true });
    await provisionApplicationDatabaseRole(database, { roleName: "app", iamRoleArn: roleArn });
    expect(statementsOf(database).some((text) => text.startsWith("CREATE ROLE"))).toBe(
      false,
    );
  });

  it("issues AWS IAM GRANT when the IAM mapping does not already exist", async () => {
    const database = fakeQueryable({ roleExists: true, mappingExists: false });
    await provisionApplicationDatabaseRole(database, { roleName: "app", iamRoleArn: roleArn });
    expect(statementsOf(database)).toContain(`AWS IAM GRANT app TO '${roleArn}'`);
  });

  it("skips AWS IAM GRANT when the IAM mapping already exists", async () => {
    const database = fakeQueryable({ roleExists: true, mappingExists: true });
    await provisionApplicationDatabaseRole(database, { roleName: "app", iamRoleArn: roleArn });
    expect(
      statementsOf(database).some((text) => text.startsWith("AWS IAM GRANT")),
    ).toBe(false);
  });

  it("always (re-)issues the table grant, and never grants schema USAGE", async () => {
    const database = fakeQueryable({ roleExists: true, mappingExists: true });
    await provisionApplicationDatabaseRole(database, { roleName: "app", iamRoleArn: roleArn });
    expect(statementsOf(database)).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app",
    );
    expect(statementsOf(database).some((text) => text.includes("USAGE ON SCHEMA"))).toBe(
      false,
    );
  });

  it("swallows an 'already mapped' AWS IAM GRANT race but rethrows unrelated errors", async () => {
    const raceDatabase = {
      query: vi.fn(async (text: string) => {
        if (text.startsWith("SELECT 1 FROM pg_roles")) return { rows: [{ x: 1 }], rowCount: null };
        if (text.startsWith("SELECT 1 FROM sys.iam_pg_role_mappings"))
          return { rows: [], rowCount: null };
        if (text.startsWith("AWS IAM GRANT"))
          throw new Error("IAM role is already mapped to a database role");
        return { rows: [], rowCount: null };
      }),
    };
    await expect(
      provisionApplicationDatabaseRole(raceDatabase, { roleName: "app", iamRoleArn: roleArn }),
    ).resolves.toBeUndefined();

    const unrelatedFailureDatabase = {
      query: vi.fn(async (text: string) => {
        if (text.startsWith("SELECT 1 FROM pg_roles")) return { rows: [{ x: 1 }], rowCount: null };
        if (text.startsWith("SELECT 1 FROM sys.iam_pg_role_mappings"))
          return { rows: [], rowCount: null };
        if (text.startsWith("AWS IAM GRANT")) throw new Error("connection reset");
        return { rows: [], rowCount: null };
      }),
    };
    await expect(
      provisionApplicationDatabaseRole(unrelatedFailureDatabase, {
        roleName: "app",
        iamRoleArn: roleArn,
      }),
    ).rejects.toThrow("connection reset");
  });

  it("rejects a role name that is not a safe unquoted SQL identifier", async () => {
    const database = fakeQueryable({ roleExists: false, mappingExists: false });
    await expect(
      provisionApplicationDatabaseRole(database, {
        roleName: "app; DROP TABLE users",
        iamRoleArn: roleArn,
      }),
    ).rejects.toThrow(/valid unquoted PostgreSQL identifier/);
  });
});
