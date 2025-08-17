import { type MiddlewareHandler } from "reono";

export const logger: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  const { method, url } = c.req;

  console.log(`→ ${method} ${url}`);

  try {
    const response = await next();
    const duration = Date.now() - start;
    const status = response instanceof Response ? response.status : 200;

    console.log(`← ${method} ${url} ${status} (${duration}ms)`);

    return response;
  } catch (error) {
    const duration = Date.now() - start;
    console.log(`✗ ${method} ${url} ERROR (${duration}ms):`, error);
    throw error;
  }
};
