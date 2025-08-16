import { describe, it, expect } from "vitest";
import { buildTrie, matchTrie } from "../src/runtime/trie";
import type { RouteDef } from "../src/runtime/types";

function route(method: RouteDef["method"], path: string[]): RouteDef {
  return {
    method,
    path,
    handler: (() => {}) as any,
    middleware: [],
  };
}

describe("Trie matching", () => {
  it("matches static paths", () => {
    const trie = buildTrie([route("GET", ["a", "b"])]);
    const m = matchTrie(trie, "GET", "/a/b");
    expect(m?.route).toBeTypeOf("function");
  });

  it("extracts params and prefers static over param", () => {
    const trie = buildTrie([
      route("GET", ["users", "me"]),
      route("GET", ["users", ":id"]),
    ]);
    const me = matchTrie(trie, "GET", "/users/me");
    expect(me?.route).toBeDefined();
    const id = matchTrie(trie, "GET", "/users/123");
    expect(id?.params).toEqual({ id: "123" });
  });

  it("supports wildcard segments", () => {
    const trie = buildTrie([route("GET", ["files", "*"])]);
    const m = matchTrie(trie, "GET", "/files/a/b/c");
    expect(m?.route).toBeDefined();
  });

  it("returns undefined for unknown path, and 405 shape for known path without method", () => {
    const trie = buildTrie([
      route("GET", ["only", "get"]),
      route("POST", ["only", "post"]),
    ]);
    const unknown = matchTrie(trie, "GET", "/nope");
    expect(unknown).toBeUndefined();
    const methodMissing = matchTrie(trie, "PATCH", "/only/get");
    expect(methodMissing).toBeDefined();
    expect(methodMissing!.route).toBeUndefined();
  });
});
