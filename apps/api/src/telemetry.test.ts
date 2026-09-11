import { describe, expect, it } from "vitest";

import {
  createCloudWatchEmbeddedMetricsTelemetry,
  createRedactingJsonTelemetry,
} from "./telemetry.js";

describe("CloudWatch Embedded Metric telemetry", () => {
  it("emits redacted API health metrics with stable low-cardinality dimensions", () => {
    const lines: string[] = [];
    const telemetry = createCloudWatchEmbeddedMetricsTelemetry(
      (line) => lines.push(line),
      { namespace: "CertQuiz/dev", service: "certquiz-api", stage: "dev" },
    );

    telemetry.emit({
      event: "api.request",
      requestId: "api:telemetry-test",
      method: "GET",
      path: "/v1/catalog",
      status: 503,
      durationMs: 12.5,
      outcome: "failed",
      ...({ token: "must-not-log" } as object),
    });

    const payload = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(payload).toMatchObject({
      service: "certquiz-api",
      stage: "dev",
      ApiRequests: 1,
      Api5xx: 1,
      ApiDurationMs: 12.5,
      token: "[REDACTED]",
    });
    expect(payload._aws).toMatchObject({
      CloudWatchMetrics: [
        {
          Namespace: "CertQuiz/dev",
          Dimensions: [["Service", "Stage"]],
        },
      ],
    });
    expect(lines[0]).not.toContain("must-not-log");
  });

  it("maps finalize, cleanup, import, projection, and DB outcomes to alarm metrics", () => {
    const lines: string[] = [];
    const telemetry = createCloudWatchEmbeddedMetricsTelemetry(
      (line) => lines.push(line),
      { namespace: "CertQuiz/prod", service: "certquiz-api", stage: "prod" },
    );

    telemetry.emit({ event: "api.finalize-expired", outcome: "failed" });
    telemetry.emit({ event: "api.cleanup", outcome: "completed", count: 3, durationMs: 8 });
    telemetry.emit({ event: "api.import", outcome: "failed" });
    telemetry.emit({ event: "api.projection-schema-failure", outcome: "failed" });
    telemetry.emit({ event: "db.runtime", outcome: "completed", durationMs: 21 });
    telemetry.emit({ event: "db.transaction", outcome: "failed", durationMs: 34 });

    const payloads = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(payloads[0]).toMatchObject({ FinalizeFailures: 1 });
    expect(payloads[1]).toMatchObject({ CleanupCompleted: 1, CleanupDeleted: 3 });
    expect(payloads[2]).toMatchObject({ ImportRollbacks: 1 });
    expect(payloads[3]).toMatchObject({ ProjectionSchemaFailures: 1 });
    expect(payloads[4]).toMatchObject({ DbRuntimeCompleted: 1, DbConnectLatencyMs: 21 });
    expect(payloads[5]).toMatchObject({
      DbTransactionFailures: 1,
      DbTransactionLatencyMs: 34,
    });
  });

  it("keeps the existing plain structured-log sink available for non-CloudWatch consumers", () => {
    const lines: string[] = [];
    createRedactingJsonTelemetry((line) => lines.push(line)).emit({
      event: "api.import",
      requestId: "api:telemetry-test",
      outcome: "completed",
    });
    expect(JSON.parse(lines[0]!)).toMatchObject({ event: "api.import", outcome: "completed" });
  });
});
