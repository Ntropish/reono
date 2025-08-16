// Public API surface for reono
// Expose nameable types so consumer inference doesn’t point to internal paths

export type {
  GlobalAttributes,
  Element as ServerElement,
  RouterElementProps,
  UseElementProps,
  GetRouteElementProps,
  PutRouteElementProps,
  PostRouteElementProps,
  DeleteRouteElementProps,
  RouterElement,
  UseElement,
  GetRouteElement,
  PutRouteElement,
  PostRouteElement,
  DeleteRouteElement,
  ApiContext,
  ApiHandler,
} from "./components";

export { createElement } from "./jsx";

export type { MiddlewareHandler } from "./components";

// A stable alias for the JSX element type consumers can refer to
export type JSXElement = import("./components").Element;

// --- Validation-aware typing helpers ---
export type Schema<T> = { parse: (input: unknown) => T };
export type InferFromSchema<S> =
  S extends Schema<infer T> ? T : S extends Record<string, any> ? S : unknown;

export type ContextWithParams<S> = Omit<
  import("./components").ApiContext,
  "params"
> & {
  params: InferFromSchema<S>;
};

// --- Core runtime exports ---
export { render } from "./runtime/render";
export type { Listener } from "./runtime/types";
