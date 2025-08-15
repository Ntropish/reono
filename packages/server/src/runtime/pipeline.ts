import type { ApiContext, MiddlewareHandler } from "../components";
import type { Match } from "./types";

export function compose(
  middleware: MiddlewareHandler[],
  terminal: MiddlewareHandler
): MiddlewareHandler {
  return function composed(ctx, next) {
    let index = -1;
    const stack = [...middleware, terminal];
    function dispatch(i: number): any {
      if (i <= index)
        return Promise.reject(new Error("next() called multiple times"));
      index = i;
      const fn = stack[i] ?? next;
      if (!fn) return Promise.resolve();
      try {
        return Promise.resolve(fn(ctx, () => dispatch(i + 1)));
      } catch (err) {
        return Promise.reject(err);
      }
    }
    return dispatch(0);
  };
}

export function jsonResponder(
  data: unknown,
  init?: number | ResponseInit
): Response {
  const initObj: ResponseInit =
    typeof init === "number" ? { status: init } : (init ?? {});
  const headers = new Headers(initObj.headers);
  if (!headers.has("content-type"))
    headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...initObj, headers });
}

export async function buildContext(req: Request): Promise<ApiContext> {
  const url = new URL(req.url);
  let parsedBody: any = undefined;
  const ct = req.headers.get("content-type") || "";
  if (req.method !== "GET" && req.method !== "HEAD") {
    if (/application\/json/i.test(ct)) {
      try {
        parsedBody = await req.json();
      } catch {
        parsedBody = undefined;
      }
    } else if (/text\//i.test(ct)) {
      parsedBody = await req.text();
    } else if (/application\/x-www-form-urlencoded/i.test(ct)) {
      const form = await req.formData();
      parsedBody = Object.fromEntries(form.entries());
    }
  }

  function json(data: unknown, init?: number | ResponseInit): Response {
    return jsonResponder(data, init);
  }

  // Temporary Response holder until adapter writes it
  const res = new Response();

  return {
    params: {},
    body: parsedBody,
    json,
    req,
    res,
    query: url.searchParams,
    headers: req.headers,
  };
}

export function applyValidation(match: Match, ctx: ApiContext): void {
  const v = match.validate;
  if (!v) return;
  if (v.params) ctx.params = v.params.parse(ctx.params);
  if (v.body) ctx.body = v.body.parse(ctx.body);
  if (v.query)
    ctx.query = new URLSearchParams(
      v.query.parse(Object.fromEntries(ctx.query ?? []))
    );
  if (v.headers)
    ctx.headers = new Headers(
      v.headers.parse(
        Object.fromEntries((ctx.headers ?? new Headers()).entries())
      )
    );
}
