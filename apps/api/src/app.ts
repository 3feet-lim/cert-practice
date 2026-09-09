import { healthSuccessEnvelopeSchema } from "@cert-quiz/contracts";
import { Hono } from "hono";

import { mapError } from "./error-mapper.js";
import { requestContext, requestIdFromContextHeader } from "./request-context.js";

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
export const app = new Hono();

app.use("/v1/*", requestContext);
app.onError((error, context) => {
  const mapped = mapError(error, requestIdFromContextHeader(context));
  return context.json(mapped.body, mapped.status);
});
app.get("/v1/health", (context) =>
  context.json(healthSuccessEnvelopeSchema.parse(healthResponse)),
);
