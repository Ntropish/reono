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

export function htmlResponder(
  data: string,
  init?: number | ResponseInit
): Response {
  const initObj: ResponseInit =
    typeof init === "number" ? { status: init } : (init ?? {});
  const headers = new Headers(initObj.headers);
  if (!headers.has("content-type"))
    headers.set("content-type", "text/html; charset=utf-8");
  return new Response(data, { ...initObj, headers });
}

export function fileResponder(
  data: ArrayBuffer | Uint8Array,
  filename?: string,
  init?: ResponseInit
): Response {
  const headers = new Headers(init?.headers);

  if (filename) {
    headers.set("content-disposition", `attachment; filename="${filename}"`);

    // Set content-type based on file extension if not provided
    if (!headers.has("content-type")) {
      const mimeType = getMimeTypeFromFilename(filename);
      if (mimeType) headers.set("content-type", mimeType);
    }
  }

  if (!headers.has("content-type")) {
    headers.set("content-type", "application/octet-stream");
  }

  return new Response(data, { ...init, headers });
}

// Utility function for cookie parsing
export function parseCookies(cookieHeader: string): Map<string, string> {
  const cookies = new Map<string, string>();

  if (!cookieHeader || !cookieHeader.trim()) return cookies;

  cookieHeader.split(";").forEach((cookie) => {
    const [name, ...value] = cookie.trim().split("=");
    if (name && value.length > 0) {
      cookies.set(name, value.join("="));
    }
  });

  return cookies;
}

// Basic MIME type detection
export function getMimeTypeFromFilename(filename: string): string | null {
  const ext = filename.split(".").pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
    json: "application/json",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    txt: "text/plain",
    xml: "application/xml",
  };
  return ext ? mimeTypes[ext] || null : null;
}
export async function buildContext(req: Request): Promise<ApiContext> {
  // Parse URL and extract components
  const url = new URL(req.url);
  const query = url.searchParams;
  const headers = req.headers;
  const cookies = parseCookies(req.headers.get("cookie") || "");
  const state = new Map<string, any>();

  // Enhanced body parsing
  let parsedBody: any = undefined;
  const ct = req.headers.get("content-type") || "";

  if (req.method !== "GET" && req.method !== "HEAD") {
    if (/application\/json/i.test(ct)) {
      try {
        parsedBody = await req.json();
      } catch (e: any) {
        parsedBody = undefined;
        (req as any)["__reono_body_error"] = e?.message || "Invalid JSON";
      }
    } else if (/text\//i.test(ct)) {
      parsedBody = await req.text();
    } else if (/application\/x-www-form-urlencoded/i.test(ct)) {
      const form = await req.formData();
      parsedBody = Object.fromEntries(form.entries());
    } else if (/multipart\/form-data/i.test(ct)) {
      parsedBody = await req.formData(); // Keep as FormData for file uploads
    } else {
      parsedBody = await req.arrayBuffer(); // Raw binary data fallback
    }
  }

  // Create context with enhanced response helpers
  let ctx!: ApiContext;

  // Enhanced response helper functions
  function json(data: unknown, init?: number | ResponseInit): Response {
    const r = jsonResponder(data, init);
    ctx.res = r;
    return r;
  }

  function text(data: string, init?: number | ResponseInit): Response {
    const r = textResponder(data, init);
    ctx.res = r;
    return r;
  }

  function html(data: string, init?: number | ResponseInit): Response {
    const r = htmlResponder(data, init);
    ctx.res = r;
    return r;
  }

  function redirect(url: string, status: number = 302): Response {
    const r = new Response(null, { status, headers: { Location: url } });
    ctx.res = r;
    return r;
  }

  function stream(stream: ReadableStream, init?: ResponseInit): Response {
    const r = new Response(stream, init);
    ctx.res = r;
    return r;
  }

  function file(
    data: ArrayBuffer | Uint8Array,
    filename?: string,
    init?: ResponseInit
  ): Response {
    const r = fileResponder(data, filename, init);
    ctx.res = r;
    return r;
  }

  ctx = {
    params: {},
    body: parsedBody,
    query,
    headers,
    cookies,
    url,
    req,
    state,
    json,
    text,
    html,
    redirect,
    stream,
    file,
  };

  return ctx;
}

export function applyValidation(match: Match, ctx: ApiContext): void {
  const v = match.validate;
  if (!v) return;
  if (v.params) ctx.params = v.params.parse(ctx.params);
  if (v.body) ctx.body = v.body.parse(ctx.body);
  if (v.query) {
    // Convert URLSearchParams to object for validation, then back to URLSearchParams
    const queryObj = Object.fromEntries(ctx.query.entries());
    const validatedQuery = v.query.parse(queryObj);
    ctx.query = new URLSearchParams(validatedQuery);
  }
  if (v.headers) {
    // Convert Headers to object for validation, then back to Headers
    const headersObj = Object.fromEntries(ctx.headers.entries());
    const validatedHeaders = v.headers.parse(headersObj);
    ctx.headers = new Headers(validatedHeaders);
  }
}
