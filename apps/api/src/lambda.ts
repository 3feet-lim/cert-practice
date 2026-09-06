import { handle } from "hono/aws-lambda";

import { app } from "./app.js";

/** AWS Lambda event adapter only; it creates no SDK clients or credentials. */
export const handler = handle(app);
