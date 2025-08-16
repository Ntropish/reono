import { describe, it, beforeAll, expect } from "vitest";
import { render, createElement } from "@reono/server";

let handle: (req: Request) => Promise<Response>;

beforeAll(() => {
  const tree = createElement(
    "router",
    { path: "" },
    // json helper with status override
    createElement("get", {
      path: "json201",
      handler: (c: any) => c.json({ created: true }, 201),
    }),
    // raw Response passthrough
    createElement("get", {
      path: "raw",
      handler: () =>
        new Response("ok", { status: 200, headers: { "x-test": "1" } }),
    }),
    // no explicit response -> default null JSON 200
    createElement("get", {
      path: "default",
      handler: () => undefined,
    })
  );
  handle = render(tree as any);
});

function url(path: string) {
  return `http://localhost/${path.replace(/^\\\//, "")}`;
}

describe("Responses", () => {
  it("c.json sets content-type and status", async () => {
    const res = await handle(new Request(url("/json201"), { method: "GET" }));
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type") || "").toMatch(/application\/json/i);
    expect(await res.json()).toEqual({ created: true });
  });

  it("raw Response passes through unchanged", async () => {
    const res = await handle(new Request(url("/raw"), { method: "GET" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-test")).toBe("1");
    const text = await res.text();
    expect(text).toBe("ok");
  });

  it("default fallback is 200 with JSON null", async () => {
    const res = await handle(new Request(url("/default"), { method: "GET" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") || "").toMatch(/application\/json/i);
    expect(await res.json()).toBeNull();
  });
});
