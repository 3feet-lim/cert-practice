import { requestIdSchema, type RequestId } from "@cert-quiz/contracts";
import type { MiddlewareHandler } from "hono";

export function createRequestId(): RequestId {
  return requestIdSchema.parse(`api:${globalThis.crypto.randomUUID()}`);
}

export const requestContext: MiddlewareHandler = async (context, next) => {
  const supplied = context.req.header("x-request-id");
  const requestId = requestIdSchema.safeParse(supplied).success
    ? requestIdSchema.parse(supplied)
    : createRequestId();
  context.header("x-request-id", requestId);
  await next();
};

export function requestIdFromContextHeader(context: {
  res: { headers: Headers };
}): RequestId {
  return requestIdSchema.parse(
    context.res.headers.get("x-request-id") ?? createRequestId(),
  );
}
