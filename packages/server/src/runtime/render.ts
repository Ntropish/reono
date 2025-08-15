import type { Element } from "../components";
import type { Listener } from "./types";
import { traverse } from "./traverse";
import { buildTrie, matchTrie } from "./trie";
import { applyValidation, buildContext, compose } from "./pipeline";

export function render(element: Element): Listener {
  const flat = traverse(element);
  const trie = buildTrie(flat.routes);

  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const method = req.method.toUpperCase() as
      | "GET"
      | "POST"
      | "PUT"
      | "DELETE"
      | "PATCH"
      | "OPTIONS"
      | "HEAD";

    const match = matchTrie(trie, method, url.pathname);
    if (!match || !match.route) {
      const status = match ? 405 : 404;
      return new Response(status === 404 ? "Not Found" : "Method Not Allowed", {
        status,
      });
    }

    const ctx = await buildContext(req);
    ctx.params = match.params;

    try {
      applyValidation(match, ctx);
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          error: "ValidationError",
          message: String(err?.message ?? err),
        }),
        {
          status: 400,
          headers: { "content-type": "application/json; charset=utf-8" },
        }
      );
    }

    const terminal = async (c: any) => {
      const out = await match.route!(c);
      if (out instanceof Response) return out;
      return c.json(out ?? null);
    };

    const chain = compose(match.handlers, terminal);
    try {
      const result = await chain(ctx, () => undefined);
      if (result instanceof Response) return result;
      // If middleware returned void and did not write, synthesize an empty 204
      return new Response(null, { status: 204 });
    } catch (e: any) {
      return new Response("Internal Server Error", { status: 500 });
    }
  };
}
