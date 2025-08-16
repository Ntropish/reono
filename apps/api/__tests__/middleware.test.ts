import { describe, it, beforeAll, expect, vi } from "vitest";
import { render, createElement, type MiddlewareHandler } from "@reono/server";

let handle: (req: Request) => Promise<Response>;
let order: string[];

beforeAll(() => {
  order = [];

  // Inner middleware: pushes enter/exit, passes through response
  const innerMw: MiddlewareHandler = async (c, next) => {
    order.push("enter:inner");
    const res = await next();
    order.push("exit:inner");
    return res;
  };

  // Outer middleware: pushes enter/exit, passes through response
  const outerMw: MiddlewareHandler = async (c, next) => {
    order.push("enter:outer");
    const res = await next();
    order.push("exit:outer");
    return res;
  };

  const tree = createElement(
    "use",
    { handler: outerMw },
    createElement(
      "use",
      { handler: innerMw },
      createElement("get", {
        path: "ok",
        handler: (c: any) => c.json({ ok: true }),
      })
    ),
    createElement("get", {
      path: "short",
      handler: (c: any) => new Response("short", { status: 202 }),
    })
  );
  handle = render(tree as any);
});

function url(path: string) {
  return `http://localhost/${path.replace(/^\\\//, "")}`;
}

describe("Middleware", () => {
  it("runs in declared order and unwinds", async () => {
    order.length = 0;
    const res = await handle(new Request(url("/ok"), { method: "GET" }));
    expect(res.status).toBe(200);
    await res.json();
    expect(order).toEqual([
      "enter:outer",
      "enter:inner",
      "exit:inner",
      "exit:outer",
    ]);
  });

  it("short-circuits when handler returns Response", async () => {
    const res = await handle(new Request(url("/short"), { method: "GET" }));
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("short");
  });

  it("multiple next() calls throw and become 500", async () => {
    const bad: MiddlewareHandler = async (c, next) => {
      await next();
      return next(); // second call should trigger protection
    };

    const tree = createElement(
      "use",
      { handler: bad },
      createElement("get", {
        path: "",
        handler: (c: any) => c.json({ ok: true }),
      })
    );
    const h = render(tree as any);
    const res = await h(new Request(url("/"), { method: "GET" }));
    expect(res.status).toBe(500);
  });
});
