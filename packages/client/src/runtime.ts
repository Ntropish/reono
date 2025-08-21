// Runtime client implementation that gets used by generated code
import type { ServerElement } from "reono";

export interface ClientRequestOptions {
  params?: Record<string, string | number>;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: HeadersInit;
  body?: any;
  parseAs?: "json" | "text" | "response" | "blob" | "arrayBuffer" | "formData";
}

export interface ClientResponse<T = any> extends Response {
  data: T;
}

export interface ReonoClientError<T = any> extends Error {
  // RFC9457
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  // Expose source fields
  response?: Response;
  data?: T;
}
export function isReonoClientError<T = any>(
  e: unknown
): e is ReonoClientError<T> {
  return (
    !!e &&
    typeof e === "object" &&
    (e as any).name === "Error" &&
    ("status" in (e as any) || "response" in (e as any))
  );
}

export interface ApiClient {
  request<T = any>(
    method: string,
    path: string,
    options?: ClientRequestOptions
  ): Promise<T>;
  get<T = any>(path: string, options?: ClientRequestOptions): Promise<T>;
  post<T = any>(path: string, options?: ClientRequestOptions): Promise<T>;
  put<T = any>(path: string, options?: ClientRequestOptions): Promise<T>;
  patch<T = any>(path: string, options?: ClientRequestOptions): Promise<T>;
  delete<T = any>(path: string, options?: ClientRequestOptions): Promise<T>;
  options<T = any>(path: string, options?: ClientRequestOptions): Promise<T>;
  head<T = any>(path: string, options?: ClientRequestOptions): Promise<T>;
}

export interface CreateClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  defaultHeaders?: HeadersInit;
}

// Enhanced types for renderClient
export type RenderClientOptions = CreateClientOptions;

export type RequestOptions = ClientRequestOptions;

export type ClientRequest = <T = unknown>(
  path: string,
  options?: RequestOptions
) => Promise<T>;

// Enhanced typed client that provides intellisense for routes
export type TypedRenderedClient<TRoutes = any> = {
  request: (
    method: string,
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

type HasParams<T extends string> =
  ExtractParams<T> extends {}
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
): string {
  if (!params) return path;

  return path.replace(/:([A-Za-z0-9_]+)/g, (_, key) => {
    const value = params[key];
    if (value === undefined || value === null) {
      throw new Error(`Missing required path parameter: ${key}`);
    }
    return encodeURIComponent(String(value));
  });
}

function buildQueryString(query?: ClientRequestOptions["query"]): string {
  if (!query) return "";

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.append(key, String(value));
    }
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

function detectContentType(body: any): string | undefined {
  if (body == null) return undefined;
  if (typeof body === "string") return "text/plain; charset=utf-8";
  if (body instanceof FormData) return undefined; // Let browser set boundary
  if (body instanceof Blob) return body.type || undefined;
  if (body instanceof URLSearchParams)
    return "application/x-www-form-urlencoded; charset=utf-8";
  if (typeof body === "object") return "application/json; charset=utf-8";
  return undefined;
}

export function createClient(options: CreateClientOptions = {}): ApiClient {
  const { baseUrl = "", fetchImpl = fetch, defaultHeaders } = options;

  async function request<T = any>(
    method: string,
    path: string,
    requestOptions: ClientRequestOptions = {}
  ): Promise<T> {
    // Build the URL
    const interpolatedPath = interpolatePath(path, requestOptions.params);
    const queryString = buildQueryString(requestOptions.query);
    const url = `${baseUrl}${interpolatedPath}${queryString}`;

    // Build headers
    const headers = new Headers(defaultHeaders);
    if (requestOptions.headers) {
      const requestHeaders = new Headers(requestOptions.headers);
      requestHeaders.forEach((value, key) => headers.set(key, value));
    }

    // Handle body
    let body: BodyInit | undefined;
    if (requestOptions.body !== undefined) {
      const contentType = detectContentType(requestOptions.body);
      if (contentType && !headers.has("content-type")) {
        headers.set("content-type", contentType);
      }

      if (contentType?.startsWith("application/json")) {
        body = JSON.stringify(requestOptions.body);
      } else {
        body = requestOptions.body as BodyInit;
      }
    }

    // Make the request
    const response = await fetchImpl(url, {
      method: method.toUpperCase(),
      headers,
      body,
    });

    // Parse response
    const parseAs = requestOptions.parseAs || "json";

    if (parseAs === "response") {
      return response as T;
    }

    let data: any;

    if (parseAs === "text") {
      data = await response.text();
    } else if (parseAs === "blob") {
      data = await response.blob();
    } else if (parseAs === "arrayBuffer") {
      data = await response.arrayBuffer();
    } else if (parseAs === "formData") {
      data = await response.formData();
    } else {
      // Default to JSON
      const contentType = response.headers.get("content-type") || "";
      if (
        contentType.includes("application/json") ||
        contentType.includes("text/json") ||
        contentType.includes("application/problem+json")
      ) {
        data = await response.json();
      } else {
        data = await response.text();
      }
    }

    // Handle errors
    if (!response.ok) {
      const err: ReonoClientError<any> = new Error(
        `HTTP ${response.status}: ${response.statusText}`
      );
      err.status = response.status;
      err.response = response;
      err.data = data;

      // If server sent Problem Details, project common fields in a public-safe way
      const ct = response.headers.get("content-type") || "";
      if (
        /application\/problem\+json/i.test(ct) &&
        data &&
        typeof data === "object"
      ) {
        const pd: any = data;
        if (typeof pd.type === "string") err.type = pd.type;
        if (typeof pd.title === "string") err.title = pd.title;
        if (typeof pd.detail === "string") err.detail = pd.detail;
        if (typeof pd.instance === "string") err.instance = pd.instance;
        // message prefers problem title
        if (err.title) err.message = `${response.status} ${err.title}`;
      }
      throw err;
    }

    return data;
  }

  return {
    request,
    get: <T = any>(path: string, options?: ClientRequestOptions) =>
      request<T>("GET", path, options),
    post: <T = any>(path: string, options?: ClientRequestOptions) =>
      request<T>("POST", path, options),
    put: <T = any>(path: string, options?: ClientRequestOptions) =>
      request<T>("PUT", path, options),
    patch: <T = any>(path: string, options?: ClientRequestOptions) =>
      request<T>("PATCH", path, options),
    delete: <T = any>(path: string, options?: ClientRequestOptions) =>
      request<T>("DELETE", path, options),
    options: <T = any>(path: string, options?: ClientRequestOptions) =>
      request<T>("OPTIONS", path, options),
    head: <T = any>(path: string, options?: ClientRequestOptions) =>
      request<T>("HEAD", path, options),
  };
}

function withQuery(path: string, query?: RequestOptions["query"]): string {
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

export function renderClient(
  element: ServerElement,
  opts: RenderClientOptions = {}
): RenderedClient {
  // Note: We could traverse and build trie to validate paths at runtime for dev UX
  // For now, we'll keep it simple and just provide the client interface

  const base = opts.baseUrl?.replace(/\/$/, "") || "";
  const $fetch = opts.fetchImpl || fetch;
  const defaultHeaders = opts.defaultHeaders;

  async function coreRequest(
    method: string,
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
export function createTypedClient<TElement extends ServerElement>(
  element: TElement,
  opts: RenderClientOptions = {}
): TypedRenderedClient {
  return renderClient(element, opts);
}
