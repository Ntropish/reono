import { type MiddlewareHandler } from "reono";
import { type Tenant } from "./auth";

// Tenant-aware CORS middleware
export const tenantCors: MiddlewareHandler = async (c, next) => {
  const tenant = (c as any).tenant as Tenant;
  const origin = c.req.headers.get("origin");

  // Determine allowed origins based on tenant configuration
  let allowedOrigins: string[] = [];

  if (tenant) {
    allowedOrigins = tenant.settings.allowedOrigins;
  } else {
    // Fallback for non-authenticated requests (health checks, etc.)
    allowedOrigins = ["*"];
  }

  // Determine the allowed origin for this request
  let allowedOrigin = "*";

  if (allowedOrigins.includes("*")) {
    allowedOrigin = "*";
  } else if (origin && allowedOrigins.includes(origin)) {
    allowedOrigin = origin;
  } else if (allowedOrigins.length > 0) {
    // Fallback to first allowed origin if specific origin not found
    allowedOrigin = allowedOrigins[0] || "*";
  }

  // Handle preflight OPTIONS requests
  if (c.req.method === "OPTIONS") {
    const requestMethod = c.req.headers.get("access-control-request-method");
    const requestHeaders = c.req.headers.get("access-control-request-headers");

    // Only handle preflight requests (those with access-control-request-method header)
    if (requestMethod) {
      const responseHeaders: Record<string, string> = {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Methods":
          "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        "Access-Control-Allow-Headers":
          requestHeaders || "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400", // 24 hours
      };

      // Only add credentials header if origin is not wildcard
      if (allowedOrigin !== "*") {
        responseHeaders["Access-Control-Allow-Credentials"] = "true";
      }

      return new Response(null, {
        status: 204,
        headers: responseHeaders,
      });
    }
  }

  // Continue with the request
  const response = await next();

  // Add CORS headers to the response
  if (response instanceof Response) {
    response.headers.set("Access-Control-Allow-Origin", allowedOrigin);

    // Only add credentials header if origin is not wildcard
    if (allowedOrigin !== "*") {
      response.headers.set("Access-Control-Allow-Credentials", "true");
    }

    response.headers.set(
      "Access-Control-Expose-Headers",
      "Content-Type, Authorization, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset"
    );
  }

  return response;
};

// Basic CORS for non-tenant-specific endpoints (keeping original as fallback)
export const cors: MiddlewareHandler = async (c, next) => {
  // Handle preflight OPTIONS requests
  if (c.req.method === "OPTIONS") {
    const response = new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods":
          "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-Requested-With",
        "Access-Control-Max-Age": "86400", // 24 hours
        "Access-Control-Allow-Credentials": "true",
      },
    });
    c.res = response;
    return response;
  }

  // Process the request
  const response = await next();

  // Add CORS headers to the response
  if (response instanceof Response) {
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }

  return response;
};

// Export alias for backward compatibility
export const basicCors = cors;
