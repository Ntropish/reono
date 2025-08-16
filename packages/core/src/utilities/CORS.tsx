import type { Element, ApiContext, MiddlewareHandler } from "../components";
import { createElement } from "../jsx";

export interface CORSProps {
  origins?: string[];
  methods?: string[];
  headers?: string[];
  credentials?: boolean;
  maxAge?: number;
  children?: Element | Element[];
}

/**
 * CORS component provides Cross-Origin Resource Sharing configuration.
 *
 * @example
 * ```tsx
 * // Basic CORS setup
 * <CORS origins={["http://localhost:3000"]} methods={["GET", "POST"]}>
 *   <router path="api">
 *     // API routes with CORS
 *   </router>
 * </CORS>
 *
 * // Full CORS configuration
 * <CORS
 *   origins={["https://example.com", "https://app.example.com"]}
 *   methods={["GET", "POST", "PUT", "DELETE"]}
 *   headers={["Content-Type", "Authorization"]}
 *   credentials={true}
 *   maxAge={86400}
 * >
 *   <router path="api">
 *     // Protected API routes
 *   </router>
 * </CORS>
 * ```
 */
export function CORS({
  origins = ["*"],
  methods = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  headers = ["Content-Type", "Authorization"],
  credentials = false,
  maxAge,
  children,
}: CORSProps): Element {
  const corsMiddleware: MiddlewareHandler = async (ctx, next) => {
    const origin = ctx.req.headers.get("origin");
    const requestMethod = ctx.req.headers.get("access-control-request-method");

    // Determine allowed origin
    const allowedOrigin = origins.includes("*")
      ? "*"
      : origin && origins.includes(origin)
        ? origin
        : origins[0] || "*";

    // Handle preflight OPTIONS requests FIRST
    if (ctx.req.method === "OPTIONS" && requestMethod) {
      const responseHeaders: Record<string, string> = {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Methods": methods.join(", "),
        "Access-Control-Allow-Headers": headers.join(", "),
      };

      if (credentials) {
        responseHeaders["Access-Control-Allow-Credentials"] = "true";
      }

      if (maxAge !== undefined) {
        responseHeaders["Access-Control-Max-Age"] = maxAge.toString();
      }

      return new Response(null, {
        status: 204,
        headers: responseHeaders,
      });
    }

    // Continue to next middleware/handler for non-preflight requests
    const response = await next();

    // Add CORS headers to actual responses
    if (response instanceof Response) {
      response.headers.set("Access-Control-Allow-Origin", allowedOrigin);

      if (credentials) {
        response.headers.set("Access-Control-Allow-Credentials", "true");
      }

      // Expose headers for simple requests
      if (headers.length > 0) {
        response.headers.set(
          "Access-Control-Expose-Headers",
          headers.join(", ")
        );
      }
    }

    return response;
  };

  return createElement("use", { handler: corsMiddleware }, children);
}
