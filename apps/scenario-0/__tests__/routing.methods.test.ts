import { describe, it, beforeAll, expect } from "vitest";
import { render, createElement } from "reono";
import { z } from "zod";

let handle: (req: Request) => Promise<Response>;

beforeAll(() => {
  const tree = createElement(
    "router",
    { path: "" },
    // Simple trailing-slash target
    createElement("get", {
      path: "trail",
      handler: (c: any) => c.json({ ok: true }),
    }),
    // Explicit routes to test 405
    createElement(
      "router",
      { path: "r" },
      createElement("get", {
        path: "onlyget",
        handler: (c: any) => c.json({ route: "GET" }),
      }),
      createElement("post", {
        path: "onlypost",
        handler: (c: any) => c.json({ route: "POST" }),
      })
    ),
    // Static vs param precedence
    createElement(
      "router",
      { path: "users" },
      createElement("get", {
        path: "me",
        handler: (c: any) => c.json({ me: true }),
      }),
      createElement("get", {
        path: ":id",
        validate: { params: z.object({ id: z.coerce.number() }) },
        handler: (c: any) => c.json({ id: c.params.id }),
      })
    ),
    // Wildcard
    createElement(
      "router",
      { path: "files" },
      createElement("get", {
        path: "*",
        handler: (c: any) => c.json({ wildcard: true }),
      })
    )
  );
  handle = render(tree as any);
});

function url(path: string) {
  return `http://localhost/${path.replace(/^\\\//, "")}`;
}

async function call(method: string, path: string, body?: any) {
  const init: RequestInit = { method, headers: {} };
  if (body !== undefined) {
    (init.headers as Record<string, string>)["content-type"] =
      "application/json";
    (init as any).body = JSON.stringify(body);
  }
  const req = new Request(url(path), init);
  return await handle(req);
}

describe("Routing and methods", () => {
  it("404 for unknown path", async () => {
    const res = await call("GET", "/nope");
    expect(res.status).toBe(404);
  });

  it("405 for known path without method", async () => {
    const res = await call("PATCH", "/r/onlyget");
    expect(res.status).toBe(405);
    const text = await res.text();
    expect(text).toMatch(/Method Not Allowed/i);
  });

  it("HEAD/OPTIONS are 405 when not defined", async () => {
    const head = await call("HEAD", "/r/onlyget");
    expect(head.status).toBe(405);
    const opts = await call("OPTIONS", "/r/onlypost");
    expect(opts.status).toBe(405);
  });

  it("trailing and multiple slashes normalize", async () => {
    const a = await call("GET", "/trail");
    expect(a.status).toBe(200);
    const aj = await a.json();
    const b = await handle(new Request(url("///trail///"), { method: "GET" }));
    expect(b.status).toBe(200);
    const bj = await b.json();
    expect(aj).toEqual(bj);
  });

  it("static route wins over param route", async () => {
    const me = await call("GET", "/users/me");
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ me: true });

    const id = await call("GET", "/users/123");
    expect(id.status).toBe(200);
    expect(await id.json()).toMatchObject({ id: 123 });
  });

  it("wildcard routes match remaining segments", async () => {
    const res = await call("GET", "/files/a/b/c");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ wildcard: true });
  });
});
