import type { RequestId } from "@cert-quiz/contracts";

export type ApiTelemetryEvent = Readonly<{
  event:
    | "api.cleanup"
    | "api.finalize-expired"
    | "api.import"
    | "api.projection-schema-failure"
    | "api.request"
    | "db.runtime"
    | "db.transaction";
  requestId?: RequestId;
  method?: string;
  path?: string;
  status?: number;
  outcome?: "accepted" | "completed" | "failed" | "rejected";
  durationMs?: number;
  count?: number;
  errorCode?: string;
}>;

export type TelemetryPort = Readonly<{
  emit(event: ApiTelemetryEvent): void | Promise<void>;
}>;

export type CloudWatchEmbeddedMetricsConfiguration = Readonly<{
  namespace: string;
  service: string;
  stage: string;
}>;

type MetricValue = Readonly<{ name: string; unit: "Count" | "Milliseconds"; value: number }>;

const sensitiveKey =
  /(?:authorization|token|email|google(?:_|-)?sub|answer|selected.*choice|explanation|content|payload|sql|bind|password|secret)/i;
const redacted = "[REDACTED]";

/** Redacts known sensitive fields recursively before structured JSON serialization. */
export function redactTelemetry(value: unknown, key?: string): unknown {
  if (key !== undefined && sensitiveKey.test(key)) return redacted;
  if (Array.isArray(value)) return value.map((entry) => redactTelemetry(entry));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactTelemetry(entryValue, entryKey),
      ]),
    );
  return value;
}

/**
 * Wraps a JSON sink so fields prohibited by Task 21 cannot escape in logs.
 * Callers must inject the resulting port from the runtime composition root.
 */
export function createRedactingJsonTelemetry(
  write: (line: string) => void,
): TelemetryPort {
  return {
    emit(event) {
      write(JSON.stringify(redactTelemetry(event)));
    },
  };
}

/**
 * Emits redacted structured JSON in CloudWatch Embedded Metric Format. Metrics
 * are extracted from the Lambda log stream, so telemetry never needs broader
 * CloudWatch API permissions and cannot affect the request path.
 */
export function createCloudWatchEmbeddedMetricsTelemetry(
  write: (line: string) => void,
  configuration: CloudWatchEmbeddedMetricsConfiguration,
): TelemetryPort {
  return {
    emit(event) {
      const metrics = metricsFor(event);
      const payload = {
        ...event,
        service: configuration.service,
        stage: configuration.stage,
        ...Object.fromEntries(metrics.map((metric) => [metric.name, metric.value])),
        _aws: {
          Timestamp: Date.now(),
          CloudWatchMetrics: [
            {
              Namespace: configuration.namespace,
              Dimensions: [["Service", "Stage"]],
              Metrics: metrics.map(({ name, unit }) => ({ Name: name, Unit: unit })),
            },
          ],
        },
      };
      write(JSON.stringify(redactTelemetry(payload)));
    },
  };
}

function metricsFor(event: ApiTelemetryEvent): MetricValue[] {
  const metrics: MetricValue[] = [{ name: "TelemetryEvents", unit: "Count", value: 1 }];
  const duration = finiteNonNegative(event.durationMs);

  switch (event.event) {
    case "api.request":
      metrics.push({ name: "ApiRequests", unit: "Count", value: 1 });
      if (duration !== undefined)
        metrics.push({ name: "ApiDurationMs", unit: "Milliseconds", value: duration });
      if ((event.status ?? 0) >= 500)
        metrics.push({ name: "Api5xx", unit: "Count", value: 1 });
      break;
    case "api.finalize-expired":
      metrics.push({
        name: event.outcome === "failed" ? "FinalizeFailures" : "FinalizeCompleted",
        unit: "Count",
        value: 1,
      });
      break;
    case "api.cleanup":
      metrics.push({
        name: event.outcome === "failed" ? "CleanupFailures" : "CleanupCompleted",
        unit: "Count",
        value: 1,
      });
      if (event.count !== undefined)
        metrics.push({ name: "CleanupDeleted", unit: "Count", value: finiteCount(event.count) });
      if (duration !== undefined)
        metrics.push({ name: "CleanupDurationMs", unit: "Milliseconds", value: duration });
      break;
    case "api.import":
      if (event.outcome === "failed")
        metrics.push({ name: "ImportRollbacks", unit: "Count", value: 1 });
      else
        metrics.push({ name: "ImportProcessed", unit: "Count", value: 1 });
      break;
    case "api.projection-schema-failure":
      metrics.push({ name: "ProjectionSchemaFailures", unit: "Count", value: 1 });
      break;
    case "db.runtime":
      metrics.push({
        name: event.outcome === "failed" ? "DbRuntimeFailures" : "DbRuntimeCompleted",
        unit: "Count",
        value: 1,
      });
      if (duration !== undefined)
        metrics.push({ name: "DbConnectLatencyMs", unit: "Milliseconds", value: duration });
      break;
    case "db.transaction":
      metrics.push({
        name: event.outcome === "failed" ? "DbTransactionFailures" : "DbTransactionCompleted",
        unit: "Count",
        value: 1,
      });
      if (duration !== undefined)
        metrics.push({ name: "DbTransactionLatencyMs", unit: "Milliseconds", value: duration });
      break;
  }

  return metrics;
}

function finiteNonNegative(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.max(0, value);
}

function finiteCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function emitTelemetry(
  telemetry: TelemetryPort | undefined,
  event: ApiTelemetryEvent,
): void {
  if (!telemetry) return;
  void Promise.resolve(telemetry.emit(event)).catch(() => {
    // Telemetry must never alter an HTTP response or disclose a sink failure.
  });
}
