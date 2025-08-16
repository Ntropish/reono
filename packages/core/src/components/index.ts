export type GlobalAttributes = {
  children?: Element | Element[];
};

// Public context passed to route handlers by this library
// Validation (if provided) should coerce these at runtime.
export type ApiContext = {
  params: Record<string, any>;
  body: any;
  json: (data: unknown, init?: number | ResponseInit) => Response;
  req: Request;
  res?: Response;
};

export type ApiHandler = (c: ApiContext) => unknown | Promise<unknown>;

export type MiddlewareHandler = (
  c: ApiContext,
  next: () => unknown | Promise<unknown>
) => unknown | Promise<unknown>;

export type Element =
  | RouterElement
  | UseElement
  | GetRouteElement
  | PutRouteElement
  | PostRouteElement
  | DeleteRouteElement
  | PatchRouteElement;

export type ElementProps =
  | RouterElementProps
  | UseElementProps
  | GetRouteElementProps
  | PutRouteElementProps
  | PostRouteElementProps
  | DeleteRouteElementProps
  | PatchRouteElementProps;

export type SchemaLike<T = unknown> = { parse: (input: unknown) => T };

// Lightweight validation spec to avoid hard-coupling to a specific schema library
export type ValidateSpec = {
  body?: SchemaLike<any>;
  query?: SchemaLike<any>;
  params?: SchemaLike<any>;
  headers?: SchemaLike<any>;
};

export type RouterElementProps = {
  children?: Element | Element[];
  path?: string | string[];
};

export type RouterElement = {
  type: "router";
  props: RouterElementProps;
};

export type UseElementProps = {
  children?: Element | Element[];
  handler?: MiddlewareHandler;
};
export type UseElement = {
  type: "use";
  props: UseElementProps;
};

export type GetRouteElementProps = {
  path?: string | string[];
  handler?: ApiHandler;
  validate?: ValidateSpec;
};

export type GetRouteElement = {
  type: "get";
  props: GetRouteElementProps;
};

export type PutRouteElementProps = {
  path?: string | string[];
  handler?: ApiHandler;
  validate?: ValidateSpec;
};

export type PutRouteElement = {
  type: "put";
  props: PutRouteElementProps;
};

export type PostRouteElementProps = {
  path?: string | string[];
  handler?: ApiHandler;
  validate?: ValidateSpec;
};

export type PostRouteElement = {
  type: "post";
  props: PostRouteElementProps;
};

export type DeleteRouteElementProps = {
  path?: string | string[];
  handler?: ApiHandler;
  validate?: ValidateSpec;
};

export type DeleteRouteElement = {
  type: "delete";
  props: DeleteRouteElementProps;
};

export type PatchRouteElementProps = {
  path?: string | string[];
  handler?: ApiHandler;
  validate?: ValidateSpec;
};

export type PatchRouteElement = {
  type: "patch";
  props: PatchRouteElementProps;
};
