import { describe, it, expect, beforeAll } from "vitest";
import { render, createElement } from "../src";
import { CORS } from "../src/utilities/CORS";

let handle: (req: Request) => Promise<Response>;

beforeAll(() => {
  const tree = CORS({
    children: [
      createElement("get", {
        path: "test",
        handler: (c: any) => c.json({ method: "GET" }),
      }),
      // Let's see if the wildcard OPTIONS gets added at this level
    ]
  });
  
  console.log("Enhanced tree:", JSON.stringify(tree, (key, value) => {
    if (key === 'handler') return '[Function]';
    return value;
  }, 2));
  handle = render(tree as any);
});

function makeRequest(path: string, options: RequestInit = {}) {
  return new Request(`http://localhost${path}`, options);
}

describe("CORS Simple Injection", () => {
  it("should inject OPTIONS route at root level", async () => {
    // Test that the specific GET route works first
    const getRes = await handle(makeRequest("/test", { method: "GET" }));
    console.log("GET status:", getRes.status);

    // Test the wildcard with unknown path
    const unknownRes = await handle(makeRequest("/unknown", { method: "OPTIONS" }));
    console.log("Unknown path OPTIONS status:", unknownRes.status);

    // Test the specific path with OPTIONS
    const res = await handle(makeRequest("/test", { method: "OPTIONS" }));
    console.log("Simple injection status:", res.status);
    if (res.status === 204) {
      console.log("Headers:", Object.fromEntries(res.headers.entries()));
    }
    expect(res.status).toBe(204);
  });

  it("GET still works", async () => {
    const res = await handle(makeRequest("/test", { method: "GET" }));
    expect(res.status).toBe(200);
  });
});
