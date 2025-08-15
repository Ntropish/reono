# bjsx (experimental)

Declarative HTTP servers with JSX. This monorepo explores defining routes, middleware, and validation using JSX intrinsic elements, compiled and executed on Node via a small runtime and pluggable adapters.

> Status: early prototype. Expect breaking changes.

## Monorepo layout

- `apps/`
  - `api/` — Example API server using the JSX routing DSL
    - `src/app.server.tsx` — JSX that declares routes and middleware (prototype DSL)
    - `src/index.tsx` — Bootstraps the server: create app and serve `<App />`
    - `src/logger.ts` — Example middleware
    - `tsconfig.json` — General TS config (excludes `*.server.tsx`)
    - `tsconfig.server.json` — TS config for server-TSX files; sets `jsxImportSource` to `@workspace/server`
    - `vite.config.ts` — Library-style build for the app entry
  - `web/` — Next.js app consuming the shared UI package (unrelated to the server DSL)

- `packages/`
  - `server/` — The JSX runtime and types for HTTP
    - `src/components/index.ts` — Type definitions for intrinsic elements:
      - `<router path>`
      - `<use handler>` (middleware)
      - `<get|put|post|delete path handler validate?>` (route handlers)
    - `src/jsx.ts` — Declares the `JSX` namespace and `IntrinsicElements` mapping so TypeScript knows the JSX tags and their props
    - `src/jsx-runtime.ts` — Runtime for the React 17+ JSX transform (`jsx`, `jsxs`, `jsxDEV`, `Fragment`)
    - `src/index.ts` — Library public API (exports types and `createElement`; runtime API to be implemented)
    - `vite.config.ts` — Builds `index` and `jsx-runtime` entries and emits d.ts
    - `package.json` — Exports map for `.` and `./jsx-runtime`
  - `node-http/` — Node.js HTTP adapter (first adapter target)
    - `src/index.ts` — `createNodeApp()` factory (currently stubbed)
  - `ui/` — Shared UI primitives (example: `Button`), used by `apps/web`
  - `eslint-config/` — Internal ESLint presets
  - `typescript-config/` — Internal TSConfig presets used across the repo

- Root
  - `package.json` — PNPM/Turbo workspace, scripts
  - `pnpm-workspace.yaml` — Workspaces
  - `turbo.json` — Turbo pipeline config
  - `tsconfig.json` — Root TS config
  - `README.md` — This document

## Concept: JSX for HTTP

- Author your server as a JSX tree of intrinsic elements representing middleware and routes.
- A renderer traverses the tree, constructs a router (trie), and registers middleware/routes on a concrete HTTP adapter.
- TypeScript understands the intrinsic elements via the `JSX` namespace in `packages/server/src/jsx.ts` and the `jsxImportSource` setting.

Example (from `apps/api/src/app.server.tsx`):

```tsx
const App = () => (
  <use handler={logger}>
    <router path="users">
      <get path=":userId" handler={(c) => c.json(getUser(c.params.userId))} />
      <get path="" handler={(c) => c.json(getAllUsers())} />
      <put
        path=":userId"
        handler={(c) => updateUser(c.params.userId, c.body)}
      />
      <delete path=":userId" handler={(c) => deleteUser(c.params.userId)} />
      <post path="" handler={(c) => createUser(c.body)} />
    </router>
  </use>
);
```

## Adapters (new)

The runtime is adapter-based so the same JSX app can run in different environments. The first adapter is a minimal Node.js HTTP implementation.

- `@workspace/node-http`
  - Provides `createNodeApp()` which returns `{ serve(element), listen(port, cb?), close() }`.
  - Internally owns the HTTP server, request parsing, and response writing.
  - The core runtime (in `@workspace/server`) traverses the JSX, builds a trie, and binds adapter handlers.
- Future adapters may target Fetch-compatible runtimes, frameworks, or edge platforms.

## Reactivity (future) via Signals

This project will base reactivity on the proposed web standard for Signals (not React). A Signals polyfill is installed and will be used once reactive routing/state is introduced. For now, the runtime does not depend on reactivity; it only needs to read the static JSX tree during `serve()`.

## TypeScript setup

- React 17+ JSX transform: `"jsx": "react-jsx"`.
- Point the JSX runtime at the server package: `"jsxImportSource": "@workspace/server"`.
- Keep server-only TSX in files that match `*.server.tsx` and compile them with a TS config that includes those files (see `apps/api/tsconfig.server.json`).
- The intrinsic elements and props are declared in `packages/server/src/jsx.ts` and `packages/server/src/components/index.ts`.

## Build and dev

- Package builds use Vite with `vite-plugin-dts` to emit types:
  - `packages/server` builds `index` and `jsx-runtime` to `dist/` with CJS+ESM.
  - `packages/node-http` builds its adapter entry.
  - `apps/api` builds its library entry via Vite.
- Root scripts (Turbo):
  - `pnpm build` — Run builds across the workspace
  - `pnpm dev` — Watch builds
  - `pnpm lint` — Lint

> Note: The adapter and runtime are not implemented yet. The API app compiles, but `createNodeApp().serve()` is currently a no-op. Implement the runtime plan below to run the server end-to-end.

## Implementation plan (runtime + adapter + trie)

1. Core element model and traversal (server)

- Ensure `createElement` normalizes `children` to an array and filters null/boolean.
- Define an internal AST shape: Router, Use, Route(method, path, validate, handler).
- Write a DFS that flattens the JSX tree into a list of route/middleware entries with accumulated path segments and middleware stacks.

2. Router: path trie

- Build a trie keyed by path segments; support static, param `:id`, and wildcard `*`.
- Nodes hold method handlers and middleware arrays. Attach validation specs per-node/method.
- Provide `match(method, pathname)` => { params, handlers, middleware }.

3. Adapter interface

- Define a minimal interface the core renderer needs:
  - `type HttpAdapter = { on(method: string, matcher: (req) => Match, handler: (ctx) => Promise<void>); listen(port, cb?); close(); }`.
- Alternatively, keep the adapter simple and let the core expose a single `(req, res)` listener the adapter wires into `http.createServer()`.

4. Node HTTP adapter (`@workspace/node-http`)

- Implement `createNodeApp()` returning `{ serve(element), listen(port, cb?), close() }`.
- `serve(element)`:
  - Call the core renderer to build the trie and a request handler `(req, res) => void`.
  - Store it and use in the HTTP server.
- `listen(port)`:
  - Create `http.createServer(handler)` and start listening. Expose `close()`.

5. Core request pipeline (server)

- Parse URL and method; run trie match; collect params.
- Build `ApiContext` with `params`, `body` (parsed JSON when content-type is application/json), `req`, `res`, and `json(data, init?)` helper.
- Compose middleware chain (like Koa): `await mw1(ctx, () => mw2(ctx, () => route(ctx)))`.
- Apply `validate` if provided: `body/query/params/headers` via `schema.parse()` and replace values on context.
- Handle 404/405 and error responses.

6. Validation typing (done in types)

- `validate` already exists in element props. Ensure runtime respects it at execution.

7. createElement enhancements (optional now)

- Flatten nested arrays/fragments and drop falsy children.
- Consider `key` support for future diffing (not required for server).

8. Ergonomics and imports

- Update `apps/api/src/index.tsx` to import the adapter directly: `import { createNodeApp } from "@workspace/node-http"`.
  - Or re-export it from `@workspace/server/adapters/node-http` for a single entry-point.

9. Testing

- Unit tests for trie matching and params extraction.
- Integration tests: render sample JSX to trie, fire fake requests, assert handler order and responses.

10. Future adapters

- Add a Fetch/WHATWG adapter for runtimes exposing `fetch(event)` or `Request/Response` pairs.
- Optionally add a high-level adapter for existing frameworks.

## Current issues to address

- Missing runtime API:
  - Implement the core traversal + trie + request pipeline in `@workspace/server`.
  - Implement `createNodeApp` in `@workspace/node-http` and wire it to the core.
- Import path in the API example:
  - Change `import { createNodeApp } from "@workspace/server"` to `@workspace/node-http` (or re-export via `@workspace/server`).
- Typing gaps (addressed):
  - Element prop types now include optional `validate` specs for all HTTP verbs.
- Exposure of global attributes:
  - The DSL currently has `GlobalAttributes`. If supporting generic `data-*` or `id` is desired, consider a mapping strategy later.

## Planned API surface

- `@workspace/server` (core):
  - `render(element)` => `{ handle(req, res) }` or `{ listener: (req, res) => void }`.
  - Types: `Handler`, `MiddlewareHandler`, element prop types.
- `@workspace/node-http` (adapter):
  - `createNodeApp()` => `{ serve(element), listen(port, cb?), close() }`.

## Development notes

- Node: >= 20 (see root `package.json` engines)
- Package manager: PNPM (repo uses `pnpm-workspace.yaml`)
- TypeScript: 5.7+
- Testing: Vitest is configured in Vite files (no tests yet)

## Next steps

1. Implement the core renderer and trie in `packages/server` and export a request handler factory.
2. Implement `packages/node-http` to wrap Node's `http` module and delegate to the core.
3. Fix the API bootstrap import to use `@workspace/node-http` and verify requests hit handlers.
4. Add tests for trie, validation, and middleware ordering.
5. Add examples of nested routers and multiple `use` layers.
6. Document Signals plans in a dedicated ADR once APIs stabilize.

---

If you’re reading this in the future and the API differs, consult `packages/server` and adapter packages first, as they are the source of truth for the JSX elements, runtime, and adapters.
