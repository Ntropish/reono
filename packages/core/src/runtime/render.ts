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
import {
  HTTPException,
  isHTTPExceptionLike,
  problemJson,
} from "./http-exception";

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
      return problemJson(404);
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
        // Back-compat: validation errors return JSON with { error, message, issues? }
        const payload: any = {
          error: "ValidationError",
          message: String(err?.message ?? "Validation failed"),
        };
        if (err instanceof ValidationError && err.issues) {
          payload.issues = err.issues;
        }
        return new Response(JSON.stringify(payload), {
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
        return problemJson(405);
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
      if (e instanceof HTTPException || isHTTPExceptionLike(e)) {
        return (
          (e as HTTPException).toResponse?.() ?? problemJson(e.status ?? 500)
        );
      }
      // Unknown error -> public-safe 500
      return problemJson(500);
    }
  };
}
