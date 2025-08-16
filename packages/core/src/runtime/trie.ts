import type { Method, RouteDef, Match } from "./types";

export type TrieHandlers = {
  methods: Map<
    Method,
    {
      handler: RouteDef["handler"];
      validate?: RouteDef["validate"];
      middleware: RouteDef["middleware"];
    }
  >;
  // Middleware attached to this exact path level (from <use> at or above). We keep it folded into routes,
  // but this can be extended for path-scoped middleware in the future.
};

export type TrieNode = {
  static: Map<string, TrieNode>;
  param?: { name: string; node: TrieNode };
  wildcard?: TrieNode;
  handlers: TrieHandlers;
};

export function buildTrie(routes: RouteDef[]): TrieNode {
  const root: TrieNode = {
    static: new Map(),
    handlers: { methods: new Map() },
  };

  for (const r of routes) {
    let node = root;
    for (const seg of r.path) {
      if (seg === "*") {
        node.wildcard ??= {
          static: new Map(),
          handlers: { methods: new Map() },
        };
        node = node.wildcard;
        break; // wildcard consumes the rest
      }
      if (seg.startsWith(":")) {
        const name = seg.slice(1);
        if (!node.param)
          node.param = {
            name,
            node: { static: new Map(), handlers: { methods: new Map() } },
          };
        node = node.param.node;
      } else {
        let next = node.static.get(seg);
        if (!next) {
          next = { static: new Map(), handlers: { methods: new Map() } };
          node.static.set(seg, next);
        }
        node = next;
      }
    }
    node.handlers.methods.set(r.method, {
      handler: r.handler,
      validate: r.validate,
      middleware: r.middleware,
    });
  }

  return root;
}

export function matchTrie(
  root: TrieNode,
  method: Method,
  pathname: string
): Match | undefined {
  const segs = normalize(pathname);
  const params: Record<string, string> = {};

  function walk(node: TrieNode, i: number): TrieNode | undefined {
    if (i === segs.length) return node;
    const seg = segs[i]!; // guarded by i < length
    const staticNext = node.static.get(seg);
    if (staticNext) {
      const hit = walk(staticNext, i + 1);
      if (hit) return hit;
    }
    if (node.param) {
      params[node.param.name] = seg;
      const hit = walk(node.param.node, i + 1);
      if (hit) return hit;
      delete params[node.param.name];
    }
    if (node.wildcard) return node.wildcard; // wildcard consumes rest
    return undefined;
  }

  const leaf = walk(root, 0);
  if (!leaf) return undefined;

  const entry = leaf.handlers.methods.get(method);
  if (!entry)
    return { params, handlers: [], route: undefined, validate: undefined };
  return {
    params,
    handlers: entry.middleware,
    route: entry.handler,
    validate: entry.validate,
  };
}

function normalize(pathname: string): string[] {
  const [urlPath = ""] = pathname.split("?");
  const trimmed = urlPath.replace(/^\/+|\/+$/g, "");
  if (!trimmed) return [];
  return trimmed.split("/");
}
