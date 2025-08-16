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

    // If no path match at all, return 404
    if (!match) {
      return new Response("Not Found", { status: 404 });
    }

    // If path matches but no method handler, we still run middleware
    // This allows CORS and other middleware to handle requests like OPTIONS
    const ctx = await buildContext(req);
    ctx.params = match.params;

    // Check for JSON parsing errors first
    if ((req as any)["__reono_body_error"]) {
      return new Response(
        JSON.stringify({
          error: "ValidationError",
          message: (req as any)["__reono_body_error"],
        }),
        {
          status: 400,
          headers: { "content-type": "application/json; charset=utf-8" },
        }
      );
    }

    // If we have a route handler, apply validation
    if (match.route) {
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
    }

    const terminal = async (c: any) => {
      // If middleware already set a response, use it
      if (c.res instanceof Response) {
        return c.res;
      }
      
      if (!match.route) {
        // No handler for this method, return 405
        return new Response("Method Not Allowed", { status: 405 });
      }
      const out = await match.route(c);
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
