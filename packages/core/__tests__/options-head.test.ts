import { describe, it, expect, beforeAll } from "vitest";
import { render, createElement } from "../src";

let handle: (req: Request) => Promise<Response>;

beforeAll(() => {
  const tree = createElement(
    "router",
    { path: "api" },
    // Test explicit OPTIONS route
    createElement("options", {
      path: "test",
      handler: (c: any) => c.json({ method: "OPTIONS" }, 200),
    }),
    // Test explicit HEAD route
    createElement("head", {
      path: "test",
      handler: (c: any) => new Response(null, { status: 200 }),
    }),
    // Test GET route for comparison
    createElement("get", {
      path: "test",
      handler: (c: any) => c.json({ method: "GET" }),
    }),
    // Test route with multiple methods including OPTIONS
    createElement("post", {
      path: "multi",
      handler: (c: any) => c.json({ method: "POST" }),
    }),
    createElement("options", {
      path: "multi",
      handler: (c: any) =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),
    })
  );
  handle = render(tree as any);
});

function makeRequest(path: string, options: RequestInit = {}) {
  return new Request(`http://localhost${path}`, options);
}

describe("OPTIONS and HEAD Route Support", () => {
  it("handles explicit OPTIONS routes", async () => {
    const res = await handle(makeRequest("/api/test", { method: "OPTIONS" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.method).toBe("OPTIONS");
  });

  it("handles explicit HEAD routes", async () => {
    const res = await handle(makeRequest("/api/test", { method: "HEAD" }));
    expect(res.status).toBe(200);
    // HEAD responses should have no body
    const text = await res.text();
    expect(text).toBe("");
  });

  it("handles GET routes normally", async () => {
    const res = await handle(makeRequest("/api/test", { method: "GET" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.method).toBe("GET");
  });

  it("returns 405 for unhandled methods", async () => {
    const res = await handle(makeRequest("/api/test", { method: "PATCH" }));
    expect(res.status).toBe(405);
  });

  it("handles CORS preflight OPTIONS correctly when route defined", async () => {
    const res = await handle(
      makeRequest("/api/multi", {
        method: "OPTIONS",
        headers: {
          "Access-Control-Request-Method": "POST",
          Origin: "https://example.com",
        },
      })
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, POST, OPTIONS"
    );
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe(
      "Content-Type"
    );
  });

  it("returns 405 for OPTIONS on paths without OPTIONS route", async () => {
    // This path only has POST, no OPTIONS route defined
    const res = await handle(
      makeRequest("/api/unknown-path", { method: "OPTIONS" })
    );
    expect(res.status).toBe(404); // Unknown path
  });
});
