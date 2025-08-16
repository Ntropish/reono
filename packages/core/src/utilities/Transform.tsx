import type { Element, ApiContext, MiddlewareHandler } from "../components";
import { createElement } from "../jsx";

export type TransformFunction = (
  response: unknown,
  ctx: ApiContext
) => unknown | Promise<unknown>;

export interface TransformProps {
  transform: TransformFunction;
  children?: Element | Element[];
}

/**
 * Transform component provides response transformation middleware.
 *
 * @example
 * ```tsx
 * // Add custom headers to all responses
 * <Transform
 *   transform={(response, ctx) => {
 *     if (response instanceof Response) {
 *       response.headers.set("X-Custom-Header", "processed");
 *       response.headers.set("X-Request-ID", crypto.randomUUID());
 *     }
 *     return response;
 *   }}
 * >
 *   <get path="data" handler={getDataHandler} />
 * </Transform>
 *
 * // Transform response data
 * <Transform
 *   transform={async (response, ctx) => {
 *     if (response && typeof response === 'object') {
 *       return {
 *         ...response,
 *         timestamp: Date.now(),
 *         requestId: crypto.randomUUID()
 *       };
 *     }
 *     return response;
 *   }}
 * >
 *   <router path="api">
 *     // All responses will include timestamp and requestId
 *   </router>
 * </Transform>
 * ```
 */
export function Transform({ transform, children }: TransformProps): Element {
  const transformMiddleware: MiddlewareHandler = async (ctx, next) => {
    const response = await next();
    return await transform(response, ctx);
  };

  return createElement("use", { handler: transformMiddleware }, children);
}
