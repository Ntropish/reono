import { describe, it, expect, beforeAll } from "vitest";
import { render, createElement } from "../../src";
import { Guard } from "../../src/utilities/Guard";
import type { ApiContext } from "../../src/components";

let handle: (req: Request) => Promise<Response>;

function makeRequest(path: string, options: RequestInit = {}) {
  return new Request(`http://localhost${path}`, options);
}

describe("Guard Component", () => {
  beforeAll(() => {
    const tree = createElement(
      "router",
      { path: "" },

      // Test static boolean condition
      Guard({
        condition: true,
        children: createElement("get", {
          path: "allowed",
          handler: (c: ApiContext) => c.json({ access: "granted" }),
        }),
      }),

      Guard({
        condition: false,
        children: createElement("get", {
          path: "denied",
          handler: (c: ApiContext) => c.json({ access: "granted" }),
        }),
      }),

      // Test function-based condition
      Guard({
        condition: (c: ApiContext) =>
          c.headers.get("x-api-key") === "secret123",
        children: createElement("get", {
          path: "api-key-required",
          handler: (c: ApiContext) => c.json({ authenticated: true }),
        }),
      }),

      // Test custom fallback
      Guard({
        condition: (c: ApiContext) =>
          c.headers.get("authorization")?.startsWith("Bearer ") || false,
        fallback: (c: ApiContext) =>
          c.json({ error: "Bearer token required" }, 401),
        children: createElement("get", {
          path: "bearer-required",
          handler: (c: ApiContext) => c.json({ user: "authenticated" }),
        }),
      }),

      // Test async condition
      Guard({
        condition: async (c: ApiContext) => {
          const token = c.headers.get("x-token");
          // Simulate async validation
          await new Promise((resolve) => setTimeout(resolve, 1));
          return token === "valid-async-token";
        },
        children: createElement("get", {
          path: "async-check",
          handler: (c: ApiContext) => c.json({ async: "success" }),
        }),
      }),

      // Test state-based condition
      createElement("use", {
        handler: async (
          c: ApiContext,
          next: () => unknown | Promise<unknown>
        ) => {
          c.state.set("user", { role: "admin" });
          return next();
        }
      }, Guard({
        condition: (c: ApiContext) => c.state.get("user")?.role === "admin",
        children: createElement("get", {
          path: "admin-only",
          handler: (c: ApiContext) => c.json({ admin: true }),
        }),
      }))
    );

    handle = render(tree);
  });

  it("allows access when condition is true", async () => {
    const res = await handle(makeRequest("/allowed"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ access: "granted" });
  });

  it("denies access when condition is false with default 403", async () => {
    const res = await handle(makeRequest("/denied"));
    expect(res.status).toBe(403);
    const text = await res.text();
    expect(text).toBe("Forbidden");
  });

  it("validates function-based conditions", async () => {
    // Without API key
    const res1 = await handle(makeRequest("/api-key-required"));
    expect(res1.status).toBe(403);

    // With correct API key
    const res2 = await handle(
      makeRequest("/api-key-required", {
        headers: { "x-api-key": "secret123" },
      })
    );
    expect(res2.status).toBe(200);
    const data = await res2.json();
    expect(data).toEqual({ authenticated: true });

    // With wrong API key
    const res3 = await handle(
      makeRequest("/api-key-required", {
        headers: { "x-api-key": "wrong-key" },
      })
    );
    expect(res3.status).toBe(403);
  });

  it("uses custom fallback responses", async () => {
    // Without bearer token
    const res1 = await handle(makeRequest("/bearer-required"));
    expect(res1.status).toBe(401);
    const data1 = await res1.json();
    expect(data1).toEqual({ error: "Bearer token required" });

    // With bearer token
    const res2 = await handle(
      makeRequest("/bearer-required", {
        headers: { authorization: "Bearer valid-token" },
      })
    );
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2).toEqual({ user: "authenticated" });
  });

  it("handles async conditions", async () => {
    // Invalid async token
    const res1 = await handle(
      makeRequest("/async-check", {
        headers: { "x-token": "invalid" },
      })
    );
    expect(res1.status).toBe(403);

    // Valid async token
    const res2 = await handle(
      makeRequest("/async-check", {
        headers: { "x-token": "valid-async-token" },
      })
    );
    expect(res2.status).toBe(200);
    const data = await res2.json();
    expect(data).toEqual({ async: "success" });
  });

  it("works with state-based conditions", async () => {
    const res = await handle(makeRequest("/admin-only"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ admin: true });
  });
});
