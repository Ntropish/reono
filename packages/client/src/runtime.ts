// Runtime client implementation that gets used by generated code

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
      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        data = await response.text();
      }
    }

    // Handle errors
    if (!response.ok) {
      const error: any = new Error(
        `HTTP ${response.status}: ${response.statusText}`
      );
      error.status = response.status;
      error.response = response;
      error.data = data;
      throw error;
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
