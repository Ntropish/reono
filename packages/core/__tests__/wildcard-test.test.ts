import { describe, it, expect, beforeAll } from "vitest";
import { render, createElement } from "../src";

let handle: (req: Request) => Promise<Response>;

beforeAll(() => {
  const tree = createElement(
    "router",
    { path: "" },
    // Test wildcard GET route
    createElement("get", {
      path: "*",
      handler: (c: any) => c.json({ method: "GET", wildcard: true }),
    }),
    // Test wildcard OPTIONS route
    createElement("options", {
      path: "*",
      handler: (c: any) => c.json({ method: "OPTIONS", wildcard: true }),
    }),
    // Regular GET route
    createElement("get", {
      path: "test",
      handler: (c: any) => c.json({ method: "GET", specific: true }),
    })
  );
  handle = render(tree as any);
});

function makeRequest(path: string, options: RequestInit = {}) {
  return new Request(`http://localhost${path}`, options);
}

describe("Wildcard OPTIONS Route", () => {
  it("wildcard OPTIONS route catches requests", async () => {
    const res = await handle(makeRequest("/unknown", { method: "OPTIONS" }));
    console.log("Wildcard OPTIONS status:", res.status);
    if (res.status === 200) {
      const data = await res.json();
      console.log("Wildcard OPTIONS data:", data);
    }
    expect(res.status).toBe(200);
  });

  it("wildcard GET route catches requests", async () => {
    const res = await handle(makeRequest("/unknown", { method: "GET" }));
    console.log("Wildcard GET status:", res.status);
    if (res.status === 200) {
      const data = await res.json();
      console.log("Wildcard GET data:", data);
    }
    expect(res.status).toBe(200);
  });

  it("specific route still works", async () => {
    const res = await handle(makeRequest("/test", { method: "GET" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.specific).toBe(true);
  });
});
