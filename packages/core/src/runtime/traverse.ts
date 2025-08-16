import type {
  Element,
  RouterElement,
  UseElement,
  GetRouteElement,
  PutRouteElement,
  PostRouteElement,
  DeleteRouteElement,
  MiddlewareHandler,
  PatchRouteElement,
  OptionsRouteElement,
  HeadRouteElement,
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

function flattenChildren(children: any): any[] {
  if (!children) return [];
  const arr = isArray(children) ? children : [children];
  return arr.filter(Boolean);
}

function isComponent(node: any): boolean {
  return node && typeof node.type === "function";
}

export function traverse(root: any): FlattenResult {
  const routes: RouteDef[] = [];
  const middleware: UseDef[] = [];

  function walk(node: any, prefix: string[], stack: MiddlewareHandler[]) {
    if (!node) return;

    // Resolve function components (including Fragment)
    if (isComponent(node)) {
      const rendered = node.type(node.props ?? {});
      if (isArray(rendered)) {
        for (const child of rendered) walk(child, prefix, stack);
      } else if (rendered) {
        walk(rendered, prefix, stack);
      }
      return;
    }

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
      case "delete":
      case "patch":
      case "options":
      case "head": {
        const el = node as
          | GetRouteElement
          | PutRouteElement
          | PostRouteElement
          | DeleteRouteElement
          | PatchRouteElement
          | OptionsRouteElement
          | HeadRouteElement;
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
      default: {
        // Unknown node type; try to traverse its children if present
        const children = node?.props?.children;
        for (const child of flattenChildren(children))
          walk(child, prefix, stack);
        break;
      }
    }
  }

  walk(root, [], []);
  return { routes, middleware };
}
