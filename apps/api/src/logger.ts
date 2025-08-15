import { type MiddlewareHandler } from "@workspace/server";

export const logger: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  const { method } = c.req as Request;
  const url = (c.req as Request).url;

  await next();

  const duration = Date.now() - start;
  console.log(`${method} ${url} (${duration}ms)`);
};
