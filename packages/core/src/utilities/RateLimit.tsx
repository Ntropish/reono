import type { Element, ApiContext, MiddlewareHandler } from "../components";
import { createElement } from "../jsx";

export type RateLimitKeyGenerator = (ctx: ApiContext) => string;

export interface RateLimitProps {
  requests: number;
  window: number; // milliseconds
  keyGen?: RateLimitKeyGenerator;
  children?: Element | Element[];
}

// Simple in-memory store for rate limiting (in production, use Redis or similar)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * RateLimit component provides request rate limiting functionality.
 *
 * @example
 * ```tsx
 * // Basic rate limiting - 100 requests per minute
 * <RateLimit requests={100} window={60000}>
 *   <router path="api">
 *     // Rate limited routes
 *   </router>
 * </RateLimit>
 *
 * // Custom key generation based on API key
 * <RateLimit
 *   requests={1000}
 *   window={3600000} // 1 hour
 *   keyGen={(c) => c.headers.get("x-api-key") || "anonymous"}
 * >
 *   <router path="premium">
 *     // Premium API endpoints
 *   </router>
 * </RateLimit>
 *
 * // Per-IP rate limiting
 * <RateLimit
 *   requests={50}
 *   window={60000}
 *   keyGen={(c) => c.headers.get("x-forwarded-for") || "unknown"}
 * >
 *   <post path="signup" handler={handleSignup} />
 * </RateLimit>
 * ```
 */
export function RateLimit({
  requests,
  window,
  keyGen,
  children,
}: RateLimitProps): Element {
  const rateLimitMiddleware: MiddlewareHandler = async (ctx, next) => {
    // Generate rate limit key
    const key = keyGen
      ? keyGen(ctx)
      : ctx.req.headers.get("x-forwarded-for") ||
        ctx.req.headers.get("x-real-ip") ||
        "default";

    const now = Date.now();
    const entry = rateLimitStore.get(key);

    if (!entry || now > entry.resetTime) {
      // First request or window expired, reset counter
      rateLimitStore.set(key, {
        count: 1,
        resetTime: now + window,
      });
      return next();
    }

    if (entry.count >= requests) {
      // Rate limit exceeded
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);

      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          message: `Too many requests. Try again in ${retryAfter} seconds.`,
          retryAfter,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": retryAfter.toString(),
            "X-RateLimit-Limit": requests.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": entry.resetTime.toString(),
          },
        }
      );
    }

    // Increment counter and continue
    entry.count++;
    rateLimitStore.set(key, entry);

    // Add rate limit headers to response
    const response = await next();
    if (response instanceof Response) {
      response.headers.set("X-RateLimit-Limit", requests.toString());
      response.headers.set(
        "X-RateLimit-Remaining",
        (requests - entry.count).toString()
      );
      response.headers.set("X-RateLimit-Reset", entry.resetTime.toString());
    }

    return response;
  };

  return createElement("use", { handler: rateLimitMiddleware }, children);
}

// Helper function to clear rate limit store (useful for testing)
export function clearRateLimitStore(): void {
  rateLimitStore.clear();
}
