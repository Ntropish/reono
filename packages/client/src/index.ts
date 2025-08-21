// Main exports for @reono/client package
export { reonoClient } from "./plugin.js";
export type { ReonoClientOptions } from "./plugin.js";

// Re-export client functions and types
export {
  createClient,
  renderClient,
  createTypedClient,
  // type ReonoClientError,
} from "./runtime.js";

export type {
  ApiClient,
  ClientRequestOptions,
  ClientResponse,
  RenderClientOptions,
  RequestOptions,
  ClientRequest,
  TypedRenderedClient,
  RenderedClient,
  SafeRequestOptions,
  SafeClientRequest,
} from "./runtime.js";
