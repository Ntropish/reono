import { describe, it, expect, beforeAll } from "vitest";
import { render, createElement } from "../../src";
import { Transform } from "../../src/utilities/Transform";
import type { ApiContext } from "../../src/components";

let handle: (req: Request) => Promise<Response>;

function makeRequest(path: string, options: RequestInit = {}) {
  return new Request(`http://localhost${path}`, options);
}

describe("Transform Component", () => {
  beforeAll(() => {
    const tree = createElement(
      "router",
      { path: "" },

      // Transform adding headers to Response objects
      Transform({
        transform: (response, ctx) => {
          if (response instanceof Response) {
            response.headers.set("X-Custom-Header", "processed");
            response.headers.set("X-Request-ID", "test-123");
          }
          return response;
        },
        children: createElement("get", {
          path: "add-headers",
          handler: (c: ApiContext) => c.json({ original: "data" }),
        }),
      }),

      // Transform modifying response data
      Transform({
        transform: (response, ctx) => {
          if (
            response &&
            typeof response === "object" &&
            !(response instanceof Response)
          ) {
            return {
              ...response,
              timestamp: 1234567890,
              requestId: "transform-test",
            };
          }
          return response;
        },
        children: createElement("get", {
          path: "add-metadata",
          handler: (c: ApiContext) => ({ original: "data" }),
        }),
      }),

      // Async transform
      Transform({
        transform: async (response, ctx) => {
          // Simulate async processing
          await new Promise((resolve) => setTimeout(resolve, 1));

          if (
            response &&
            typeof response === "object" &&
            !(response instanceof Response)
          ) {
            return {
              ...response,
              async: true,
              processed: true,
            };
          }
          return response;
        },
        children: createElement("get", {
          path: "async-transform",
          handler: (c: ApiContext) => ({ data: "async" }),
        }),
      }),

      // Transform with access to context
      Transform({
        transform: (response, ctx) => {
          const userAgent = ctx.headers.get("user-agent") || "unknown";

          if (
            response &&
            typeof response === "object" &&
            !(response instanceof Response)
          ) {
            return {
              ...response,
              userAgent,
              path: ctx.url.pathname,
            };
          }
          return response;
        },
        children: createElement("get", {
          path: "context-aware",
          handler: (c: ApiContext) => ({ data: "context" }),
        }),
      }),

      // Nested transforms
      Transform({
        transform: (response, ctx) => {
          if (
            response &&
            typeof response === "object" &&
            !(response instanceof Response)
          ) {
            return { ...response, outer: true };
          }
          return response;
        },
        children: Transform({
          transform: (response, ctx) => {
            if (
              response &&
              typeof response === "object" &&
              !(response instanceof Response)
            ) {
              return { ...response, inner: true };
            }
            return response;
          },
          children: createElement("get", {
            path: "nested",
            handler: (c: ApiContext) => ({ base: "data" }),
          }),
        }),
      }),

      // Transform that handles different response types
      Transform({
        transform: (response, ctx) => {
          if (response instanceof Response) {
            // Don't modify Response objects, just add header
            response.headers.set("X-Response-Type", "response");
            return response;
          } else if (typeof response === "string") {
            return `Transformed: ${response}`;
          } else if (response === null || response === undefined) {
            return { transformed: true, original: response };
          }
          return response;
        },
        children: [
          createElement("get", {
            path: "direct-response",
            handler: (c: ApiContext) =>
              new Response("Direct response", { status: 200 }),
          }),
          createElement("get", {
            path: "string-response",
            handler: (c: ApiContext) => "Plain string",
          }),
          createElement("get", {
            path: "null-response",
            handler: (c: ApiContext) => null,
          }),
        ],
      })
    );

    handle = render(tree);
  });

  it("adds headers to Response objects", async () => {
    const res = await handle(makeRequest("/add-headers"));

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Custom-Header")).toBe("processed");
    expect(res.headers.get("X-Request-ID")).toBe("test-123");

    const data = await res.json();
    expect(data).toEqual({ original: "data" });
  });

  it("transforms response data objects", async () => {
    const res = await handle(makeRequest("/add-metadata"));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      original: "data",
      timestamp: 1234567890,
      requestId: "transform-test",
    });
  });

  it("handles async transformations", async () => {
    const res = await handle(makeRequest("/async-transform"));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      data: "async",
      async: true,
      processed: true,
    });
  });

  it("provides access to request context", async () => {
    const res = await handle(
      makeRequest("/context-aware", {
        headers: { "user-agent": "test-browser/1.0" },
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      data: "context",
      userAgent: "test-browser/1.0",
      path: "/context-aware",
    });
  });

  it("supports nested transforms", async () => {
    const res = await handle(makeRequest("/nested"));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      base: "data",
      inner: true,
      outer: true,
    });
  });

  it("handles different response types correctly", async () => {
    // Direct Response object
    const res1 = await handle(makeRequest("/direct-response"));
    expect(res1.status).toBe(200);
    expect(res1.headers.get("X-Response-Type")).toBe("response");
    expect(await res1.text()).toBe("Direct response");

    // String response
    const res2 = await handle(makeRequest("/string-response"));
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2).toBe("Transformed: Plain string");

    // Null response
    const res3 = await handle(makeRequest("/null-response"));
    expect(res3.status).toBe(200);
    const data3 = await res3.json();
    expect(data3).toEqual({ transformed: true, original: null });
  });
});
