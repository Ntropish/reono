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

export function textResponder(
  data: string,
  init?: number | ResponseInit
): Response {
  const initObj: ResponseInit =
    typeof init === "number" ? { status: init } : (init ?? {});
  const headers = new Headers(initObj.headers);
  if (!headers.has("content-type"))
    headers.set("content-type", "text/plain; charset=utf-8");
  return new Response(data, { ...initObj, headers });
}

export async function buildContext(req: Request): Promise<ApiContext> {
  let parsedBody: any = undefined;
  const ct = req.headers.get("content-type") || "";
  if (req.method !== "GET" && req.method !== "HEAD") {
    if (/application\/json/i.test(ct)) {
      try {
        parsedBody = await req.json();
      } catch (e: any) {
        // Invalid JSON -> surface 400 downstream
        parsedBody = undefined;
        (req as any)["__bjsx_body_error"] = e?.message || "Invalid JSON";
      }
    } else if (/text\//i.test(ct)) {
      parsedBody = await req.text();
    } else if (/application\/x-www-form-urlencoded/i.test(ct)) {
      const form = await req.formData();
      parsedBody = Object.fromEntries(form.entries());
    }
  }

  let ctx!: ApiContext;
  function json(data: unknown, init?: number | ResponseInit): Response {
    const r = jsonResponder(data, init);
    ctx.res = r;
    return r;
  }

  ctx = {
    params: {},
    body: parsedBody,
    json,
    req,
  };

  return ctx;
}

export function applyValidation(match: Match, ctx: ApiContext): void {
  const v = match.validate;
  if (!v) return;
  if (v.params) ctx.params = v.params.parse(ctx.params);
  if (v.body) ctx.body = v.body.parse(ctx.body);
  // query and headers can be added when present on ApiContext
}
