import { describe, it, expect, beforeAll } from "vitest";
import { render, createElement } from "../../src";
import { CORS } from "../../src/utilities/CORS";
import type { ApiContext } from "../../src/components";

let handle: (req: Request) => Promise<Response>;

function makeRequest(path: string, options: RequestInit = {}) {
  return new Request(`http://localhost${path}`, options);
}

describe("CORS Component", () => {
  beforeAll(() => {
    const tree = createElement(
      "router",
      { path: "" },

      // Basic CORS with defaults
      CORS({
        children: createElement("get", {
          path: "basic",
          handler: (c: ApiContext) => c.json({ cors: "basic" }),
        }),
      }),

      // Custom CORS configuration
      CORS({
        origins: ["https://example.com", "https://app.example.com"],
        methods: ["GET", "POST", "PUT"],
        headers: ["Content-Type", "Authorization", "X-Custom-Header"],
        credentials: true,
        maxAge: 86400,
        children: createElement(
          "router",
          { path: "api" },
          createElement("get", {
            path: "data",
            handler: (c: ApiContext) => c.json({ data: "secured" }),
          }),
          createElement("post", {
            path: "data",
            handler: (c: ApiContext) => c.json({ created: true }),
          })
        ),
      }),

      // Wildcard origins
      CORS({
        origins: ["*"],
        children: createElement("get", {
          path: "public",
          handler: (c: ApiContext) => c.json({ public: true }),
        }),
      })
    );

    handle = render(tree);
  });

  it("handles basic CORS with default settings", async () => {
    const res = await handle(
      makeRequest("/basic", {
        headers: { origin: "https://example.com" },
      })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const data = await res.json();
    expect(data).toEqual({ cors: "basic" });
  });

  it("handles preflight OPTIONS requests", async () => {
    const res = await handle(
      makeRequest("/api/data", {
        method: "OPTIONS",
        headers: {
          origin: "https://example.com",
          "access-control-request-method": "POST",
          "access-control-request-headers": "Content-Type,Authorization",
        },
      })
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://example.com"
    );
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, POST, PUT"
    );
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe(
      "Content-Type, Authorization, X-Custom-Header"
    );
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(res.headers.get("Access-Control-Max-Age")).toBe("86400");
  });

  it("allows configured origins and rejects others", async () => {
    // Allowed origin
    const res1 = await handle(
      makeRequest("/api/data", {
        headers: { origin: "https://example.com" },
      })
    );
    expect(res1.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://example.com"
    );

    // Another allowed origin
    const res2 = await handle(
      makeRequest("/api/data", {
        headers: { origin: "https://app.example.com" },
      })
    );
    expect(res2.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://app.example.com"
    );

    // Disallowed origin - should fall back to first allowed origin
    const res3 = await handle(
      makeRequest("/api/data", {
        headers: { origin: "https://malicious.com" },
      })
    );
    expect(res3.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://example.com"
    );
  });

  it("handles wildcard origins", async () => {
    const res = await handle(
      makeRequest("/public", {
        headers: { origin: "https://anywhere.com" },
      })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("adds CORS headers to actual responses", async () => {
    const res = await handle(
      makeRequest("/api/data", {
        headers: { origin: "https://example.com" },
      })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://example.com"
    );
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(res.headers.get("Access-Control-Expose-Headers")).toBe(
      "Content-Type, Authorization, X-Custom-Header"
    );

    const data = await res.json();
    expect(data).toEqual({ data: "secured" });
  });

  it("handles requests without origin header", async () => {
    const res = await handle(makeRequest("/api/data"));

    expect(res.status).toBe(200);
    // Should fall back to first configured origin
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://example.com"
    );
  });

  it("handles non-preflight OPTIONS requests normally", async () => {
    // OPTIONS without access-control-request-method should be treated as regular request
    const res = await handle(
      makeRequest("/api/data", {
        method: "OPTIONS",
        headers: { origin: "https://example.com" },
      })
    );

    // Should return 405 since no OPTIONS handler is defined for this route
    expect(res.status).toBe(405);
  });
});
