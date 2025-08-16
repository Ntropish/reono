import type { Element } from "../components";
import type { Listener } from "./types";
import { traverse } from "./traverse";
import { buildTrie, matchTrie } from "./trie";
import {
  applyValidation,
  buildContext,
  compose,
  ValidationError,
} from "./pipeline";

export function render(element: Element): Listener {
  const flat = traverse(element);
  const trie = buildTrie(flat.routes);

  console.log(
    "Rendered routes:",
    flat.routes.map((r) => ({
      method: r.method,
      path: r.path.join("/"),
      hasValidate: !!r.validate,
      validate: r.validate,
    }))
  );

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
    console.log("Match result:", {
      hasMatch: !!match,
      hasRoute: !!match?.route,
      hasValidate: !!match?.validate,
      validate: match?.validate,
      path: url.pathname,
      method,
    });

    if (!match || !match.route) {
      const status = match ? 405 : 404;
      return new Response(status === 404 ? "Not Found" : "Method Not Allowed", {
        status,
      });
    }

    const ctx = await buildContext(req);
    ctx.params = match.params;

    try {
      await applyValidation(match, ctx);
    } catch (err: any) {
      const errorResponse: any = {
        error: "ValidationError",
        message: String(err?.message ?? err),
      };

      // Include issues if available (from standard schema format)
      if (err instanceof ValidationError && err.issues) {
        errorResponse.issues = err.issues;
      }

      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
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
      if (ctx.res) return ctx.res;
      // Fallback if nothing produced a Response
      return new Response(JSON.stringify(null), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    } catch (e: any) {
      return new Response("Internal Server Error", { status: 500 });
    }
  };
}
