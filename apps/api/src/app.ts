import { healthSuccessEnvelopeSchema } from "@cert-quiz/contracts";
import { Hono } from "hono";

const healthResponse = healthSuccessEnvelopeSchema.parse({
  data: {
    status: "ok",
    service: "cert-quiz-api",
    contractVersion: "v1",
  },
  meta: { requestId: "api:health" },
});

/**
 * HTTP application with no infrastructure side effects at module load.
 * Dependencies such as authentication and repositories are introduced by later
 * tasks, keeping this bootstrap endpoint safe for in-memory contract tests.
 */
export const app = new Hono().get("/v1/health", (context) =>
  context.json(healthSuccessEnvelopeSchema.parse(healthResponse)),
);
