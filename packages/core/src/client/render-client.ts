import { traverse } from "../runtime/traverse";
import { buildTrie } from "../runtime/trie";
import type { Element } from "../components";

// Lightweight method union for client
export type ClientMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "OPTIONS"
  | "HEAD";

export type RenderClientOptions = {
  baseUrl?: string; // e.g. http://localhost:3000
  fetchImpl?: typeof fetch; // custom fetch for tests
  defaultHeaders?: HeadersInit;
};

export type RequestOptions = {
  params?: Record<string, string | number>;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: HeadersInit;
  body?: any;
  // Allow overriding parse behavior (json by default)
  parseAs?: "json" | "text" | "response" | "blob" | "arrayBuffer" | "formData";
};

export type ClientRequest = <T = unknown>(
  path: string,
  options?: RequestOptions
) => Promise<T>;

// Enhanced typed client that provides intellisense for routes
export type TypedRenderedClient<TRoutes = any> = {
  request: (
    method: ClientMethod,
    path: string,
    options?: RequestOptions
  ) => Promise<any>;
  get: ClientRequest;
  post: ClientRequest;
  put: ClientRequest;
  patch: ClientRequest;
  delete: ClientRequest;
  options: ClientRequest;
  head: ClientRequest;
  // Internal route metadata for dev tooling
  _routes?: TRoutes;
};

export type RenderedClient = TypedRenderedClient;

// Type helpers for extracting route information
type ExtractParams<T extends string> =
  T extends `${infer _Start}:${infer Param}/${infer Rest}`
    ? { [K in Param]: string | number } & ExtractParams<`/${Rest}`>
    : T extends `${infer _Start}:${infer Param}`
    ? { [K in Param]: string | number }
    : {};

type HasParams<T extends string> = ExtractParams<T> extends {}
  ? keyof ExtractParams<T> extends never
    ? false
    : true
  : false;

// Enhanced request options that require params when path has parameters
export type SafeRequestOptions<TPath extends string> =
  HasParams<TPath> extends true
    ? RequestOptions & { params: ExtractParams<TPath> }
    : RequestOptions;

// Type-safe client request function
export type SafeClientRequest = <TPath extends string, T = unknown>(
  path: TPath,
  options?: SafeRequestOptions<TPath>
) => Promise<T>;

function interpolatePath(
  path: string,
  params?: Record<string, string | number>
) {
  if (!params) return path;
  return path.replace(/:([A-Za-z0-9_]+)/g, (_, key) => {
    const v = params[key];
    if (v === undefined || v === null) {
      throw new Error(`Missing param :${key}`);
    }
    return encodeURIComponent(String(v));
  });
}

function withQuery(path: string, query?: RequestOptions["query"]) {
  if (!query) return path;
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue;
    usp.append(k, String(v));
  }
  const q = usp.toString();
  if (!q) return path;
  return path.includes("?") ? `${path}&${q}` : `${path}?${q}`;
}

function detectContentType(body: any): string | undefined {
  if (body == null) return undefined;
  if (typeof body === "string") return "text/plain; charset=utf-8";
  if (body instanceof FormData) return undefined; // browser sets boundary
  if (body instanceof Blob) return (body as any).type || undefined;
  if (body instanceof URLSearchParams)
    return "application/x-www-form-urlencoded; charset=utf-8";
  if (typeof body === "object") return "application/json; charset=utf-8";
  return undefined;
}

export function renderClient(
  element: Element,
  opts: RenderClientOptions = {}
): RenderedClient {
  // Traverse and build trie so we can validate that requested paths exist at runtime (dev UX)
  // Note: We do not ship runtime type info; we only provide friendly errors and convenience helpers.
  const flat = traverse(element);
  const trie = buildTrie(flat.routes);

  const base = opts.baseUrl?.replace(/\/$/, "") || "";
  const $fetch = opts.fetchImpl || fetch;
  const defaultHeaders = opts.defaultHeaders;

  async function coreRequest(
    method: ClientMethod,
    path: string,
    options: RequestOptions = {}
  ) {
    // Interpolate params and query
    let finalPath = interpolatePath(path, options.params);
    finalPath = withQuery(finalPath, options.query);

    const url = base
      ? `${base}${finalPath.startsWith("/") ? "" : "/"}${finalPath}`
      : finalPath;

    const headers = new Headers(defaultHeaders);
    if (options.headers) {
      const h = new Headers(options.headers);
      h.forEach((v, k) => headers.set(k, v));
    }

    let body: BodyInit | undefined;
    if (options.body !== undefined) {
      const ct = detectContentType(options.body);
      if (ct && !headers.has("content-type")) headers.set("content-type", ct);
      if (ct?.startsWith("application/json"))
        body = JSON.stringify(options.body);
      else body = options.body as any;
    }

    const res = await $fetch(url, { method, headers, body });

    // Default parse
    const mode = options.parseAs || "json";
    if (mode === "response") return res;
    if (mode === "text") return (await res.text()) as any;
    if (mode === "blob") return (await res.blob()) as any;
    if (mode === "arrayBuffer") return (await res.arrayBuffer()) as any;
    if (mode === "formData") return (await res.formData()) as any;

    // JSON default
    const ctRes = res.headers.get("content-type") || "";
    if (/application\/json/i.test(ctRes)) {
      const data = await res.json();
      if (!res.ok) {
        const err: any = new Error(data?.message || `HTTP ${res.status}`);
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    }
    // Non-JSON: return Response for caller
    if (!res.ok) {
      const err: any = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return (await res.text()) as any;
  }

  const client: RenderedClient = {
    request: coreRequest,
    get: (path, o) => coreRequest("GET", path, o),
    post: (path, o) => coreRequest("POST", path, o),
    put: (path, o) => coreRequest("PUT", path, o),
    patch: (path, o) => coreRequest("PATCH", path, o),
    delete: (path, o) => coreRequest("DELETE", path, o),
    options: (path, o) => coreRequest("OPTIONS", path, o),
    head: (path, o) => coreRequest("HEAD", path, o),
  };

  return client;
}

// Type-safe render client factory (for when full type safety is needed)
export function createTypedClient<TElement extends Element>(
  element: TElement,
  opts: RenderClientOptions = {}
): TypedRenderedClient {
  return renderClient(element, opts);
}
