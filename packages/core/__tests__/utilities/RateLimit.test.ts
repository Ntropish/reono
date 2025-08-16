import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { render, createElement } from "../../src";
import { RateLimit, clearRateLimitStore } from "../../src/utilities/RateLimit";
import type { ApiContext } from "../../src/components";

let handle: (req: Request) => Promise<Response>;

function makeRequest(path: string, options: RequestInit = {}) {
  return new Request(`http://localhost${path}`, options);
}

// Helper to wait for a specific amount of time
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("RateLimit Component", () => {
  beforeEach(() => {
    // Clear rate limit store before each test
    clearRateLimitStore();
  });

  beforeAll(() => {
    const tree = createElement(
      "router",
      { path: "" },

      // Basic rate limiting - 3 requests per 100ms window
      RateLimit({
        requests: 3,
        window: 100,
        children: createElement("get", {
          path: "basic",
          handler: (c: ApiContext) => c.json({ message: "Success" }),
        }),
      }),

      // Rate limiting with custom key generation
      RateLimit({
        requests: 2,
        window: 100,
        keyGen: (c: ApiContext) => c.headers.get("x-api-key") || "anonymous",
        children: createElement("get", {
          path: "api-key",
          handler: (c: ApiContext) =>
            c.json({ apiUser: c.headers.get("x-api-key") }),
        }),
      }),

      // Rate limiting with IP-based key
      RateLimit({
        requests: 1,
        window: 50,
        keyGen: (c: ApiContext) =>
          c.headers.get("x-forwarded-for") || "unknown-ip",
        children: createElement("post", {
          path: "signup",
          handler: (c: ApiContext) => c.json({ message: "Account created" }),
        }),
      }),

      // No rate limiting for comparison
      createElement("get", {
        path: "unlimited",
        handler: (c: ApiContext) => c.json({ message: "No limits" }),
      })
    );

    handle = render(tree as any);
  });

  it("allows requests within rate limit", async () => {
    // First request should succeed
    const res1 = await handle(makeRequest("/basic"));
    expect(res1.status).toBe(200);
    expect(res1.headers.get("X-RateLimit-Limit")).toBe("3");
    expect(res1.headers.get("X-RateLimit-Remaining")).toBe("2");

    // Second request should succeed
    const res2 = await handle(makeRequest("/basic"));
    expect(res2.status).toBe(200);
    expect(res2.headers.get("X-RateLimit-Remaining")).toBe("1");

    // Third request should succeed
    const res3 = await handle(makeRequest("/basic"));
    expect(res3.status).toBe(200);
    expect(res3.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("blocks requests when rate limit exceeded", async () => {
    // Exhaust the rate limit
    await handle(makeRequest("/basic"));
    await handle(makeRequest("/basic"));
    await handle(makeRequest("/basic"));

    // Fourth request should be blocked
    const res = await handle(makeRequest("/basic"));
    expect(res.status).toBe(429);

    const error = await res.json();
    expect(error.error).toBe("Rate limit exceeded");
    expect(error.retryAfter).toBeGreaterThan(0);

    // Check rate limit headers
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(res.headers.get("X-RateLimit-Limit")).toBe("3");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("resets rate limit after window expires", async () => {
    // Exhaust the rate limit
    await handle(makeRequest("/basic"));
    await handle(makeRequest("/basic"));
    await handle(makeRequest("/basic"));

    // Verify it's blocked
    const blocked = await handle(makeRequest("/basic"));
    expect(blocked.status).toBe(429);

    // Wait for window to expire
    await sleep(110); // Window is 100ms

    // Should be able to make requests again
    const res = await handle(makeRequest("/basic"));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("2");
  });

  it("uses custom key generation correctly", async () => {
    // User 1 makes requests
    const res1 = await handle(
      makeRequest("/api-key", {
        headers: { "x-api-key": "user1" },
      })
    );
    expect(res1.status).toBe(200);

    const res2 = await handle(
      makeRequest("/api-key", {
        headers: { "x-api-key": "user1" },
      })
    );
    expect(res2.status).toBe(200);

    // User 1 is now at limit
    const res3 = await handle(
      makeRequest("/api-key", {
        headers: { "x-api-key": "user1" },
      })
    );
    expect(res3.status).toBe(429);

    // User 2 should still be able to make requests
    const res4 = await handle(
      makeRequest("/api-key", {
        headers: { "x-api-key": "user2" },
      })
    );
    expect(res4.status).toBe(200);
  });

  it("handles requests without custom key", async () => {
    // Anonymous users (no x-api-key) should share the same limit
    const res1 = await handle(makeRequest("/api-key"));
    expect(res1.status).toBe(200);

    const res2 = await handle(makeRequest("/api-key"));
    expect(res2.status).toBe(200);

    // Third request from anonymous user should be blocked
    const res3 = await handle(makeRequest("/api-key"));
    expect(res3.status).toBe(429);
  });

  it("works with IP-based rate limiting", async () => {
    const ip1 = "192.168.1.1";
    const ip2 = "192.168.1.2";

    // IP1 makes a request
    const res1 = await handle(
      makeRequest("/signup", {
        method: "POST",
        headers: { "x-forwarded-for": ip1 },
      })
    );
    expect(res1.status).toBe(200);

    // IP1 makes another request - should be blocked (limit is 1)
    const res2 = await handle(
      makeRequest("/signup", {
        method: "POST",
        headers: { "x-forwarded-for": ip1 },
      })
    );
    expect(res2.status).toBe(429);

    // IP2 should still be able to make requests
    const res3 = await handle(
      makeRequest("/signup", {
        method: "POST",
        headers: { "x-forwarded-for": ip2 },
      })
    );
    expect(res3.status).toBe(200);
  });

  it("does not affect unlimited endpoints", async () => {
    // Make many requests to unlimited endpoint
    for (let i = 0; i < 10; i++) {
      const res = await handle(makeRequest("/unlimited"));
      expect(res.status).toBe(200);
    }
  });

  it("includes proper rate limit headers in responses", async () => {
    const res = await handle(makeRequest("/basic"));

    expect(res.headers.has("X-RateLimit-Limit")).toBe(true);
    expect(res.headers.has("X-RateLimit-Remaining")).toBe(true);
    expect(res.headers.has("X-RateLimit-Reset")).toBe(true);

    const limit = parseInt(res.headers.get("X-RateLimit-Limit")!);
    const remaining = parseInt(res.headers.get("X-RateLimit-Remaining")!);
    const reset = parseInt(res.headers.get("X-RateLimit-Reset")!);

    expect(limit).toBe(3);
    expect(remaining).toBe(2);
    expect(reset).toBeGreaterThan(Date.now());
  });
});
