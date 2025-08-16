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

    // If response is already a Response object, handle it appropriately
    if (response instanceof Response) {
      const contentType = response.headers.get("content-type") || "";

      // For JSON responses, extract data, transform, and recreate if needed
      if (contentType.includes("application/json")) {
        try {
          // Clone the response to avoid consuming the body
          const cloned = response.clone();
          const data = await cloned.json();

          // Transform the data
          const transformed = await transform(data, ctx);

          // If transformation returns a Response, use it directly
          if (transformed instanceof Response) {
            return transformed;
          }

          // If data was actually transformed, create new response with original headers
          if (transformed !== data) {
            const newResponse = ctx.json(transformed);
            // Copy original headers
            for (const [key, value] of response.headers.entries()) {
              newResponse.headers.set(key, value);
            }
            return newResponse;
          }
        } catch {
          // If JSON parsing fails, fall through to transform the Response object
        }
      }

      // For non-JSON responses or when we want to transform the Response object itself
      const transformed = await transform(response, ctx);
      return transformed instanceof Response ? transformed : response;
    }

    // For non-Response objects, transform directly
    return await transform(response, ctx);
  };

  return createElement("use", { handler: transformMiddleware }, children);
}
