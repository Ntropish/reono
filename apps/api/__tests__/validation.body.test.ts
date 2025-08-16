import { describe, it, beforeAll, expect } from "vitest";
import { render, createElement } from "@reono/server";
import { z } from "zod";

let handle: (req: Request) => Promise<Response>;

beforeAll(() => {
  const Body = z.object({ name: z.string() });
  const Params = z.object({ id: z.coerce.number() });

  const tree = createElement(
    "router",
    { path: "users" },
    createElement("post", {
      path: "",
      validate: { body: Body },
      handler: (c: any) => c.json({ ok: true, body: c.body }),
    }),
    createElement("put", {
      path: ":id",
      validate: { body: Body, params: Params },
      handler: (c: any) => c.json({ id: c.params.id, name: c.body.name }),
    })
  );
  handle = render(tree as any);
});

function url(path: string) {
  return `http://localhost/${path.replace(/^\\\//, "")}`;
}

async function call(method: string, path: string, init?: RequestInit) {
  const req = new Request(url(path), init);
  return await handle(req);
}

describe("Validation and body parsing", () => {
  it("application/json parses and validates", async () => {
    const res = await call("POST", "/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "A" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ ok: true, body: { name: "A" } });
  });

  it("invalid JSON yields 400", async () => {
    const res = await call("POST", "/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ not: json",
    });
    expect(res.status).toBe(400);
  });

  it("schema validation failure yields 400", async () => {
    const res = await call("POST", "/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: 123 }),
    });
    expect(res.status).toBe(400);
    const t = await res.text();
    expect(t).toMatch(/ValidationError|error/i);
  });

  it("params are coerced and exposed to handler", async () => {
    const res = await call("PUT", "/users/42", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Bob" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ id: 42, name: "Bob" });
  });

  it("text/plain body is parsed as string", async () => {
    const tree = createElement("post", {
      path: "text",
      handler: (c: any) => c.json({ text: c.body, type: typeof c.body }),
    });
    const handle2 = render(tree as any);
    const res = await handle2(
      new Request(url("/text"), {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "hello",
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ text: "hello", type: "string" });
  });

  it("x-www-form-urlencoded parses to object", async () => {
    const tree = createElement("post", {
      path: "form",
      handler: (c: any) => c.json(c.body),
    });
    const handle2 = render(tree as any);
    const res = await handle2(
      new Request(url("/form"), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ a: "1", b: "two" }),
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ a: "1", b: "two" });
  });
});
