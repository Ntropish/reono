// Minimal HTTPException and Problem Details helper for public-safe errors

export type ProblemDetails = {
  type: string; // URI reference identifying the problem type
  title: string; // Short, human-readable summary of the problem type
  status: number; // HTTP status code
  detail?: string; // Human-readable explanation specific to this occurrence
  instance?: string; // URI reference that identifies the specific occurrence
};

const STATUS_TITLES: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  409: "Conflict",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  501: "Not Implemented",
  502: "Bad Gateway",
  503: "Service Unavailable",
};

function toTitle(status: number, fallback?: string): string {
  return fallback || STATUS_TITLES[status] || `HTTP ${status}`;
}

export function problemJson(
  status: number,
  init?: {
    title?: string;
    detail?: string;
    type?: string;
    instance?: string;
    headers?: HeadersInit;
  }
): Response {
  const body: ProblemDetails = {
    type: init?.type || "about:blank",
    title: toTitle(status, init?.title),
    status,
    ...(init?.detail ? { detail: init.detail } : {}),
    ...(init?.instance ? { instance: init.instance } : {}),
  };

  const headers = new Headers(init?.headers);
  if (!headers.has("content-type"))
    headers.set("content-type", "application/problem+json; charset=utf-8");

  return new Response(JSON.stringify(body), { status, headers });
}

export class HTTPException extends Error {
  readonly status: number;
  readonly res?: Response;
  readonly headers?: HeadersInit;
  readonly type?: string;
  readonly title?: string;
  readonly detail?: string;
  readonly instance?: string;

  constructor(
    status: number,
    opts?: {
      message?: string; // alias for detail
      res?: Response; // direct response override
      headers?: HeadersInit;
      type?: string;
      title?: string;
      detail?: string;
      instance?: string;
    }
  ) {
    super(opts?.message || opts?.detail || toTitle(status));
    this.name = "HTTPException";
    this.status = status;
    this.res = opts?.res;
    this.headers = opts?.headers;
    this.type = opts?.type;
    this.title = opts?.title;
    this.detail = opts?.detail || opts?.message;
    this.instance = opts?.instance;
  }

  toResponse(): Response {
    if (this.res instanceof Response) return this.res;
    return problemJson(this.status, {
      title: this.title,
      detail: this.detail,
      type: this.type,
      instance: this.instance,
      headers: this.headers,
    });
  }

  // Convenience creators for common statuses
  static badRequest(opts?: ConstructorParameters<typeof HTTPException>[1]) {
    return new HTTPException(400, opts);
  }
  static unauthorized(opts?: ConstructorParameters<typeof HTTPException>[1]) {
    return new HTTPException(401, opts);
  }
  static forbidden(opts?: ConstructorParameters<typeof HTTPException>[1]) {
    return new HTTPException(403, opts);
  }
  static notFound(opts?: ConstructorParameters<typeof HTTPException>[1]) {
    return new HTTPException(404, opts);
  }
  static methodNotAllowed(
    opts?: ConstructorParameters<typeof HTTPException>[1]
  ) {
    return new HTTPException(405, opts);
  }
  static conflict(opts?: ConstructorParameters<typeof HTTPException>[1]) {
    return new HTTPException(409, opts);
  }
  static unprocessableEntity(
    opts?: ConstructorParameters<typeof HTTPException>[1]
  ) {
    return new HTTPException(422, opts);
  }
  static tooManyRequests(
    opts?: ConstructorParameters<typeof HTTPException>[1]
  ) {
    return new HTTPException(429, opts);
  }
  static internalServerError(
    opts?: ConstructorParameters<typeof HTTPException>[1]
  ) {
    return new HTTPException(500, opts);
  }

  // Create an HTTPException that will return the provided Response as-is
  static response(res: Response) {
    // Ensure we have a reasonable status code
    const status = (res && typeof res.status === "number" && res.status) || 500;
    return new HTTPException(status, { res });
  }
}

// Narrowing helper to recognize HTTP-like exceptions across module boundaries
export function isHTTPExceptionLike(err: any): err is HTTPException {
  return (
    !!err &&
    (err.name === "HTTPException" || typeof err.toResponse === "function") &&
    typeof err.status === "number"
  );
}
