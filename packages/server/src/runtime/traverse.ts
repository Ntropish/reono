import type {
  Element,
  RouterElement,
  UseElement,
  GetRouteElement,
  PutRouteElement,
  PostRouteElement,
  DeleteRouteElement,
  MiddlewareHandler,
} from "../components";
import type { FlattenResult, RouteDef, UseDef } from "./types";

function normPath(path?: string | string[]): string[] {
  if (!path) return [];
  const parts = Array.isArray(path) ? path : [path];
  const segs: string[] = [];
  for (const p of parts) {
    for (const s of p.split("/")) {
      if (!s || s === ".") continue;
      segs.push(s);
    }
  }
  return segs;
}

function isArray<T>(v: T | T[]): v is T[] {
  return Array.isArray(v);
}

function flattenChildren(children: Element | Element[] | undefined): Element[] {
  if (!children) return [];
  const arr = isArray(children) ? children : [children];
  // children were already packed by createElement; keep as-is but filter falsy
  return arr.filter(Boolean) as Element[];
}

export function traverse(root: Element): FlattenResult {
  const routes: RouteDef[] = [];
  const middleware: UseDef[] = [];

  function walk(node: Element, prefix: string[], stack: MiddlewareHandler[]) {
    switch (node.type) {
      case "router": {
        const p = (node as RouterElement).props.path;
        const nextPrefix = prefix.concat(normPath(p));
        for (const child of flattenChildren(
          (node as RouterElement).props.children
        )) {
          walk(child, nextPrefix, stack);
        }
        break;
      }
      case "use": {
        const u = node as UseElement;
        const handler = u.props.handler;
        if (handler) {
          // Record middleware attached at this level for potential diagnostics
          middleware.push({ path: prefix.slice(), middleware: handler });
          const nextStack = stack.concat(handler);
          for (const child of flattenChildren(u.props.children)) {
            walk(child, prefix, nextStack);
          }
        } else {
          for (const child of flattenChildren(u.props.children))
            walk(child, prefix, stack);
        }
        break;
      }
      case "get":
      case "put":
      case "post":
      case "delete": {
        const el = node as
          | GetRouteElement
          | PutRouteElement
          | PostRouteElement
          | DeleteRouteElement;
        const method = node.type.toUpperCase() as RouteDef["method"];
        const path = prefix.concat(normPath(el.props.path));
        if (el.props.handler) {
          routes.push({
            method,
            path,
            handler: el.props.handler,
            validate: el.props.validate,
            middleware: stack.slice(),
          });
        }
        break;
      }
      default:
        // ignore unknown types for now
        break;
    }
  }

  walk(root, [], []);
  return { routes, middleware };
}
