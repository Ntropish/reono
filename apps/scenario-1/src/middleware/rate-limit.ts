import { type MiddlewareHandler } from "reono";
import { type User } from "./auth";

// Simple in-memory rate limiter
interface RateLimit {
  requests: number;
  windowStart: number;
  windowMs: number;
  maxRequests: number;
}

const rateLimits = new Map<string, RateLimit>();

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyGenerator?: (c: any) => string; // Custom key generator
}

export function createRateLimit(config: RateLimitConfig): MiddlewareHandler {
  return async (c, next) => {
    const now = Date.now();
    const key = config.keyGenerator
      ? config.keyGenerator(c)
      : c.req.headers.get("x-forwarded-for") || "global";

    let limit = rateLimits.get(key);

    // Initialize or reset window if expired
    if (!limit || now - limit.windowStart >= config.windowMs) {
      limit = {
        requests: 0,
        windowStart: now,
        windowMs: config.windowMs,
        maxRequests: config.maxRequests,
      };
    }

    limit.requests++;
    rateLimits.set(key, limit);

    // Check if limit exceeded
    if (limit.requests > config.maxRequests) {
      const remainingMs = config.windowMs - (now - limit.windowStart);

      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          retryAfter: Math.ceil(remainingMs / 1000),
          limit: config.maxRequests,
          window: config.windowMs / 1000,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": Math.ceil(remainingMs / 1000).toString(),
            "X-RateLimit-Limit": config.maxRequests.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": Math.ceil(
              (limit.windowStart + config.windowMs) / 1000
            ).toString(),
          },
        }
      );
    }

    // Add rate limit headers to response
    const response = await next();
    if (response instanceof Response) {
      response.headers.set("X-RateLimit-Limit", config.maxRequests.toString());
      response.headers.set(
        "X-RateLimit-Remaining",
        Math.max(0, config.maxRequests - limit.requests).toString()
      );
      response.headers.set(
        "X-RateLimit-Reset",
        Math.ceil((limit.windowStart + config.windowMs) / 1000).toString()
      );
    }

    return response;
  };
}

// Pre-configured rate limiters
export const globalRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100, // 100 requests per 15 minutes
});

export const userBasedRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60, // 60 requests per minute for authenticated users
  keyGenerator: (c) => {
    const user = (c as any).user as User | undefined;
    if (!user) return "anonymous";

    // Different limits based on user tier
    if (user.tier === "premium") {
      return `user:${user.id}:premium`;
    }
    return `user:${user.id}:free`;
  },
});

export const uploadRateLimit = createRateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 10, // 10 uploads per 5 minutes
  keyGenerator: (c) => {
    const user = (c as any).user as User | undefined;
    return user ? `upload:${user.id}` : "upload:anonymous";
  },
});
