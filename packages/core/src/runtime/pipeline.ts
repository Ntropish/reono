import type {
  ApiContext,
  MiddlewareHandler,
  Schema,
  ValidateSpec,
  CustomValidator,
} from "../components";
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
      try {
        const form = await req.formData();
        parsedBody = Object.fromEntries(form.entries());
      } catch (e: any) {
        (req as any)["__reono_body_error"] = e?.message || "Invalid form data";
      }
    } else if (/multipart\/form-data/i.test(ct)) {
      try {
        parsedBody = await req.formData(); // Keep as FormData for file uploads
      } catch (e: any) {
        (req as any)["__reono_body_error"] = e?.message || "Invalid multipart data";
      }
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

// Validation error class for proper error handling
export class ValidationError extends Error {
  public readonly issues?: Array<{
    message: string;
    path?: Array<string | number>;
  }>;

  constructor(
    message: string,
    issues?: Array<{ message: string; path?: Array<string | number> }>
  ) {
    super(message);
    this.name = "ValidationError";
    this.issues = issues;
  }
}

// Helper function to validate input using any supported schema format
export async function validateWithSchema<T = unknown>(
  schema: Schema<T>,
  input: unknown,
  ctx?: ApiContext
): Promise<T> {
  // Custom validator function
  if (typeof schema === "function") {
    if (!ctx) {
      throw new ValidationError("Custom validator requires context");
    }
    await schema(ctx);
    return input as T;
  }

  // Zod/parse format (parse method) - check this FIRST to avoid conflicts
  if (
    typeof schema === "object" &&
    schema !== null &&
    "parse" in schema &&
    typeof (schema as any).parse === "function"
  ) {
    const zodSchema = schema as any;
    try {
      const result = zodSchema.parse(input);
      return result;
    } catch (error) {
      throw new ValidationError(
        error instanceof Error ? error.message : "Parse validation failed"
      );
    }
  }

  // SafeParse format (safeParse method) - check before standard schema
  if (
    typeof schema === "object" &&
    schema !== null &&
    "safeParse" in schema &&
    typeof (schema as any).safeParse === "function"
  ) {
    const safeParseSchema = schema as any;
    const result = safeParseSchema.safeParse(input);
    if (result.success) {
      return result.data;
    } else {
      throw new ValidationError(
        result.error?.message || "SafeParse validation failed"
      );
    }
  }

  // Standard schema format (~standard) - check after specific validation library methods
  if (typeof schema === "object" && schema !== null && "~standard" in schema) {
    const standardSchema = schema as any;
    const result = standardSchema["~standard"].validate(input);
    if (result.success) {
      return result.data;
    } else {
      throw new ValidationError(
        "Standard schema validation failed",
        result.issues
      );
    }
  }

  // Joi format (validate method) - check last
  if (
    typeof schema === "object" &&
    schema !== null &&
    "validate" in schema &&
    typeof (schema as any).validate === "function"
  ) {
    const joiSchema = schema as any;
    const result = joiSchema.validate(input);
    if (result.error === null) {
      return result.value;
    } else {
      throw new ValidationError(
        result.error?.message || "Joi validation failed"
      );
    }
  }

  throw new ValidationError("Unsupported schema format");
}

// Enhanced validation function with support for all context properties
export async function applyValidation(
  match: Match,
  ctx: ApiContext
): Promise<void> {
  const v = match.validate;
  if (!v) return;

  try {
    // Validate params
    if (v.params) {
      ctx.params = await validateWithSchema(v.params, ctx.params, ctx);
    }

    // Validate body
    if (v.body) {
      ctx.body = await validateWithSchema(v.body, ctx.body, ctx);
    }

    // Validate query parameters
    if (v.query) {
      // Convert URLSearchParams to object for validation
      const queryObj = Object.fromEntries(ctx.query.entries());
      const validatedQuery = await validateWithSchema(v.query, queryObj, ctx);
      // Store validated query as a special property and preserve original for backward compatibility
      (ctx as any)._validatedQuery = validatedQuery;
      ctx.query = new URLSearchParams(queryObj); // Keep original functionality
    }

    // Validate headers
    if (v.headers) {
      // Convert Headers to object for validation
      const headersObj = Object.fromEntries(ctx.headers.entries());
      const validatedHeaders = await validateWithSchema(
        v.headers,
        headersObj,
        ctx
      );
      (ctx as any)._validatedHeaders = validatedHeaders;
      ctx.headers = new Headers(headersObj); // Keep original functionality
    }

    // Validate cookies
    if (v.cookies) {
      // Convert cookie Map to object for validation
      const cookiesObj = Object.fromEntries(ctx.cookies.entries());
      const validatedCookies = await validateWithSchema(
        v.cookies,
        cookiesObj,
        ctx
      );
      (ctx as any)._validatedCookies = validatedCookies;
      ctx.cookies = new Map(Object.entries(cookiesObj)); // Keep original functionality
    }

    // Run custom validation
    if (v.custom) {
      await validateWithSchema(v.custom, null, ctx);
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    // Wrap other errors in ValidationError
    throw new ValidationError(
      error instanceof Error ? error.message : "Validation failed"
    );
  }
}
