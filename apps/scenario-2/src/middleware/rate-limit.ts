import { type MiddlewareHandler } from "reono";
import {
  type Tenant,
  type User,
  type ApiKey,
  getTenantRateLimit,
} from "./auth";

// Enhanced rate limiter for multi-tenant architecture
interface RateLimit {
  requests: number;
  windowStart: number;
  windowMs: number;
  maxRequests: number;
  burstUsed: number;
  maxBurst: number;
}

const rateLimits = new Map<string, RateLimit>();

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  burstLimit?: number; // Burst allowance
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
        burstUsed: 0,
        maxBurst: config.burstLimit || 0,
      };
    }

    limit.requests++;

    // Check burst limit first (for immediate requests)
    if (config.burstLimit && limit.burstUsed < config.burstLimit) {
      limit.burstUsed++;
      rateLimits.set(key, limit);

      const response = await next();
      if (response instanceof Response) {
        response.headers.set(
          "X-RateLimit-Limit",
          config.maxRequests.toString()
        );
        response.headers.set("X-RateLimit-Burst", config.burstLimit.toString());
        response.headers.set(
          "X-RateLimit-Burst-Remaining",
          Math.max(0, config.burstLimit - limit.burstUsed).toString()
        );
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
    }

    // Check regular rate limit
    if (limit.requests > config.maxRequests) {
      const remainingMs = config.windowMs - (now - limit.windowStart);

      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          message: `Too many requests. Limit: ${config.maxRequests} per ${config.windowMs / 1000}s`,
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

    rateLimits.set(key, limit);

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

// Tenant-aware rate limiting middleware
export const tenantRateLimit: MiddlewareHandler = async (c, next) => {
  const tenant = (c as any).tenant as Tenant;
  const user = (c as any).user as User;
  const apiKey = (c as any).apiKey as ApiKey;

  if (!tenant || !user || !apiKey) {
    // If no tenant context, apply global rate limit
    return globalRateLimit(c, next);
  }

  const rateLimitConfig = getTenantRateLimit(tenant);

  // Create tenant + user specific rate limiter
  const tenantUserRateLimit = createRateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour window
    maxRequests: rateLimitConfig.requestsPerHour,
    burstLimit: rateLimitConfig.burstLimit,
    keyGenerator: (c) => `tenant:${tenant.id}:user:${user.id}`,
  });

  return tenantUserRateLimit(c, next);
};

// Subscription-specific rate limiting
export function createSubscriptionRateLimit(
  subscription: "free" | "premium" | "enterprise"
): MiddlewareHandler {
  const limits = {
    free: { requests: 100, window: 60 * 60 * 1000, burst: 10 },
    premium: { requests: 1000, window: 60 * 60 * 1000, burst: 50 },
    enterprise: { requests: 10000, window: 60 * 60 * 1000, burst: 200 },
  };

  const config = limits[subscription];

  return createRateLimit({
    windowMs: config.window,
    maxRequests: config.requests,
    burstLimit: config.burst,
    keyGenerator: (c) => {
      const tenant = (c as any).tenant as Tenant;
      const user = (c as any).user as User;
      return `${subscription}:${tenant?.id || "unknown"}:${user?.id || "unknown"}`;
    },
  });
}

// Per-endpoint rate limiting for sensitive operations
export const sensitiveOperationRateLimit = createRateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 10, // Max 10 sensitive operations per 5 minutes
  keyGenerator: (c) => {
    const tenant = (c as any).tenant as Tenant;
    const user = (c as any).user as User;
    return `sensitive:${tenant?.id || "unknown"}:${user?.id || "unknown"}`;
  },
});

// Global fallback rate limiting (for non-authenticated requests)
export const globalRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100, // 100 requests per 15 minutes globally
});

// Analytics endpoint specific rate limiting (premium+ only)
export const analyticsRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30, // 30 analytics requests per minute
  keyGenerator: (c) => {
    const tenant = (c as any).tenant as Tenant;
    return `analytics:${tenant?.id || "unknown"}`;
  },
});

// Billing endpoint rate limiting (to prevent abuse)
export const billingRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10, // 10 billing requests per minute
  keyGenerator: (c) => {
    const tenant = (c as any).tenant as Tenant;
    return `billing:${tenant?.id || "unknown"}`;
  },
});

// Export for testing/debugging
export function clearRateLimits() {
  rateLimits.clear();
}
