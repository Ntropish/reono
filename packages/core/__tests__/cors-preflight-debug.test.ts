import { describe, it, expect, beforeAll } from "vitest";
import { render, createElement } from "../src";
import { CORS } from "../src/utilities/CORS";

let handle: (req: Request) => Promise<Response>;

beforeAll(() => {
  const tree = createElement(
    "router",
    { path: "" },
    CORS({
      origins: ["https://example.com"],
      methods: ["GET", "POST", "OPTIONS"],
      headers: ["Content-Type"],
      children: createElement(
        "router",
        { path: "api" },
        // Only GET route defined - no explicit OPTIONS
        createElement("get", {
          path: "test",
          handler: (c: any) => c.json({ method: "GET" }),
        })
      ),
    })
  );
  handle = render(tree as any);
});

function makeRequest(path: string, options: RequestInit = {}) {
  return new Request(`http://localhost${path}`, options);
}

describe("CORS Preflight Handling", () => {
  it("handles preflight OPTIONS even without explicit OPTIONS route", async () => {
    const res = await handle(
      makeRequest("/api/test", {
        method: "OPTIONS",
        headers: {
          Origin: "https://example.com",
          "Access-Control-Request-Method": "GET",
        },
      })
    );

    // This should return 204, not 405
    console.log("Response status:", res.status);
    console.log("Response headers:", Object.fromEntries(res.headers.entries()));

    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://example.com"
    );
  });

  it("normal GET request works fine", async () => {
    const res = await handle(
      makeRequest("/api/test", {
        method: "GET",
        headers: {
          Origin: "https://example.com",
        },
      })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://example.com"
    );
  });
});
