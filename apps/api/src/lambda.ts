import { handle } from "hono/aws-lambda";

import { productionComposition } from "./production.js";

/** Lazily composes the production graph once and reuses it for Lambda warm starts. */
export async function handler(...args: Parameters<ReturnType<typeof handle>>) {
  const { app } = await productionComposition();
  return handle(app)(...args);
}

/**
 * EventBridge retention handler. It deliberately invokes only the bounded
 * completed-practice cleanup operation; expired exams remain lazy-finalized by
 * authenticated owner API requests.
 */
export async function practiceRetentionHandler(): Promise<{ deleted: number }> {
  const composition = await productionComposition();
  return { deleted: await composition.cleanupExpiredPracticeResults() };
}
