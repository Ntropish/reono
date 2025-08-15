import type {
  ApiHandler,
  MiddlewareHandler,
  ValidateSpec,
} from "../components";

export type Method =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "OPTIONS"
  | "HEAD";

export type RouteDef = {
  method: Method;
  path: string[]; // normalized segments without leading/trailing slashes; empty for root
  handler: ApiHandler;
  validate?: ValidateSpec;
  middleware: MiddlewareHandler[];
};

export type UseDef = {
  path: string[]; // prefix where middleware applies
  middleware: MiddlewareHandler;
};

export type FlattenResult = {
  routes: RouteDef[];
  middleware: UseDef[];
};

export type Match = {
  params: Record<string, string>;
  handlers: MiddlewareHandler[];
  route?: ApiHandler;
  validate?: ValidateSpec;
};

export type Listener = (req: Request) => Promise<Response>;
