import { describe, it, expect, beforeAll } from "vitest";
import { render, createElement } from "../../src";
import { Static } from "../../src/utilities/Static";
import type { ApiContext } from "../../src/components";

let handle: (req: Request) => Promise<Response>;

function makeRequest(path: string, options: RequestInit = {}) {
  return new Request(`http://localhost${path}`, options);
}

describe("Static Component", () => {
  beforeAll(() => {
    const authMiddleware = async (
      c: ApiContext,
      next: () => Promise<unknown>
    ) => {
      const auth = c.headers.get("authorization");
      if (!auth) {
        return c.json({ error: "Authentication required" }, 401);
      }
      return await next();
    };

    const tree = createElement(
      "router",
      { path: "" },

      // Basic static file serving
      Static({
        path: "/assets",
        directory: "./public",
      }),

      // Static with middleware
      Static({
        path: "/protected",
        directory: "./private",
        middleware: [authMiddleware],
      }),

      // Nested with other routes
      createElement("router", { path: "app" }, [
        Static({
          path: "/static",
          directory: "./dist",
        }),
        createElement("get", {
          path: "api/users",
          handler: (c: ApiContext) => c.json({ users: [] }),
        }),
      ])
    );

    handle = render(tree as any);
  });

  it("serves static files at basic path", async () => {
    const res = await handle(makeRequest("/assets/style.css"));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toMatchObject({
      message: "Static file served",
      path: "style.css",
      directory: "./public",
    });
  });

  it("serves nested file paths", async () => {
    const res = await handle(makeRequest("/assets/js/app.js"));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toMatchObject({
      path: "js/app.js",
      directory: "./public",
    });
  });

  it("prevents directory traversal attacks", async () => {
    const res = await handle(makeRequest("/assets/../etc/passwd"));
    // URL normalization at the Request level means this becomes "/etc/passwd"
    // which doesn't match our static routes, so we get 404 (which is good security)
    expect(res.status).toBe(404);

    const text = await res.text();
    expect(text).toBe(
      `{"type":"about:blank","title":"Not Found","status":404}`
    );
  });

  it("blocks path traversal with backslashes", async () => {
    const res = await handle(makeRequest("/assets/..\\windows\\system32"));
    // URL normalization at the Request level means this doesn't match our routes
    expect(res.status).toBe(404);
  });

  it("applies middleware correctly", async () => {
    // Without auth header
    const res1 = await handle(makeRequest("/protected/secret.txt"));
    expect(res1.status).toBe(401);

    const error = await res1.json();
    expect(error).toMatchObject({ error: "Authentication required" });

    // With auth header
    const res2 = await handle(
      makeRequest("/protected/secret.txt", {
        headers: { authorization: "Bearer token123" },
      })
    );
    expect(res2.status).toBe(200);

    const data = await res2.json();
    expect(data.directory).toBe("./private");
  });

  it("works in nested router contexts", async () => {
    const res = await handle(makeRequest("/app/static/bundle.js"));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toMatchObject({
      path: "bundle.js",
      directory: "./dist",
    });
  });

  it("allows other routes to work alongside static", async () => {
    const res = await handle(makeRequest("/app/api/users"));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toMatchObject({ users: [] });
  });

  it("handles empty file paths", async () => {
    const res = await handle(makeRequest("/assets/"));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.path).toBe("index.html");
  });
});
