import { type MiddlewareHandler } from "@workspace/server";

export const logger: MiddlewareHandler = async (c, next) => {
  const start = Date.now();

  await next();

  const duration = Date.now() - start;
  const logMessage = `${c.req.method} ${c.req.url} - ${c.res.status} (${duration}ms)`;

  console.log(logMessage);
};
