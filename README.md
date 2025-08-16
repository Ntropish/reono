# bjsx (experimental)

Declarative HTTP servers with JSX. Define routes, middleware, and validation using JSX intrinsic elements, rendered to a request handler and run via pluggable adapters.

> Status: prototype working end-to-end. Core runtime, trie router, validation, and a Node HTTP adapter are implemented. Expect breaking changes.

## Monorepo layout

- `apps/`
  - `api/` — Example API server using the JSX routing DSL
    - `src/app.server.tsx` — JSX that declares routes and middleware (prototype DSL)
    - `src/index.tsx` — Bootstraps the server: create app and serve `<App />`
    - `src/logger.ts` — Example middleware
    - `__tests__/` — Integration tests against the in-memory runtime and live server
  - `web/` — Next.js app consuming the shared UI package (unrelated to the server DSL)

- `packages/`
  - `server/` — The JSX runtime, types, renderer, and trie
    - `src/components/index.ts` — Types for intrinsic elements and handler contracts
    - `src/jsx.ts` — JSX namespace + IntrinsicElements map
    - `src/jsx-runtime.ts` — Runtime for the React 17+ JSX transform
    - `src/runtime/` — Core: traversal, trie, pipeline, render
    - `__tests__/` — Unit tests (e.g. trie matching)
  - `node-http/` — Node.js HTTP adapter (IncomingMessage <-> Fetch Request/Response)
  - `ui/`, `eslint-config/`, `typescript-config/` — Internal packages

- Root
  - `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.json`

## Quickstart

- Requirements: Node >= 20, PNPM.
- Build all: `pnpm build`
- Run API example: from `apps/api` → `pnpm build && pnpm start` (starts at http://localhost:3000)
- Test API: `pnpm test` (in `apps/api`)
  - Live test hits the running server on `API_BASE_URL` (default http://localhost:3000).

## Concept: JSX for HTTP

Author your server as a JSX tree of intrinsic elements representing middleware and routes. The runtime traverses the tree, builds a path trie, and produces a request listener that adapters can wire up.

Example (from `apps/api/src/app.server.tsx` and `routes/users/router.tsx`):

```tsx
const App = () => (
  <use handler={logger}>
    <router path="users">
      <get path="" handler={(c) => c.json(getAllUsers())} />
      <get
        path=":userId"
        validate={{ params: z.object({ userId: z.coerce.number() }) }}
        handler={(c) => c.json(getUser(c.params.userId))}
      />
      <put
        path=":userId"
        validate={{
          body: userInputSchema,
          params: z.object({ userId: z.coerce.number() }),
        }}
        handler={(c) => updateUser(c.params.userId, c.body)}
      />
      <delete
        path=":userId"
        validate={{ params: z.object({ userId: z.coerce.number() }) }}
        handler={(c) => deleteUser(c.params.userId)}
      />
      <post
        path=""
        validate={{ body: userInputSchema }}
        handler={(c) => createUser(c.body)}
      />
    </router>
  </use>
);
```

## Intrinsic elements and props

- `<router path>`: groups child routes under a path prefix. `path` can be string or array. Supports nested routers.
- `<use handler>`: middleware. Runs outer-to-inner and unwinds inner-to-outer. Multiple nested `use` stack.
- HTTP routes: `<get|post|put|delete|patch path handler validate?>`
  - `path` supports:
    - Static: `users`
    - Params: `:id` (captured in `c.params` as string, optionally coerced via `validate.params`)
    - Wildcard: `*` (consumes the remainder)
  - `validate` (optional): `{ body?, query?, params?, headers? }` where each is a schema-like object with `parse(input)` (e.g. Zod). On success, values are replaced in `c.body`, `c.params`, etc. On failure, the runtime responds 400 with a JSON error payload.

## Runtime semantics

- Request method support: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `OPTIONS`, `HEAD`. Only the five route tags are supported in JSX; `OPTIONS`/`HEAD` return 405 unless explicitly routed.
- Matching and normalization:
  - Leading/trailing/multiple slashes are normalized.
  - Static segments are preferred over params at the same depth (`/users/me` wins over `/users/:id`).
  - `*` wildcard matches remaining segments.
- 404 vs 405:
  - Unknown path → 404 Not Found.
  - Known path without a handler for the method → 405 Method Not Allowed (plain text).
- Middleware composition:
  - Koa-style `(ctx, next)`; order is declaration order.
  - Calling `next()` multiple times is guarded and results in a 500.
  - Middleware may short-circuit by returning a `Response`.
- Body parsing (based on `Content-Type`):
  - `application/json` → parsed JSON object (invalid JSON → 400).
  - `text/*` → string via `req.text()`.
  - `application/x-www-form-urlencoded` → plain object from FormData.
- Context and responses:
  - `c` includes `{ params, body, req, res?, json(data, init?) }`.
  - `c.json()` sets `content-type: application/json; charset=utf-8` and optional status.
  - Handlers may return a `Response` directly; it is passed through unchanged.
  - If no handler or middleware writes a response, a default `200` with JSON `null` is returned.

## Adapter: Node HTTP (`@workspace/node-http`)

- `createNodeApp()` returns `{ serve(element), listen(port, cb?), close() }`.
- `serve(element)` builds the trie and stores a fetch-compatible handler.
- `listen(port)` wires Node’s `http.createServer` to translate IncomingMessage → Fetch Request and write back the Fetch Response. Uses `Readable.toWeb(req)` for request bodies and sets `duplex: "half"` when needed. Responses currently buffer their body before writing (streaming can be added later).

## Testing

Integration tests (apps/api/**tests**):

- `users.test.ts` — In-memory runtime integration for the sample routes.
- `users.live.test.ts` — Live HTTP tests against a running server.
- `routing.methods.test.ts` — 404 vs 405, slash normalization, static-vs-param precedence, wildcard.
- `validation.body.test.ts` — JSON parsing/validation, malformed JSON, params coercion, text/plain and urlencoded bodies.
- `middleware.test.ts` — Middleware order/unwind, short-circuit, next() guard.
- `responses.test.ts` — `c.json` helper, raw Response passthrough, default fallback.

Unit tests (packages/server/**tests**):

- `trie.test.ts` — Direct tests for `buildTrie`/`matchTrie` (static/param/wildcard, 404/405 shape).

Run tests:

- From `apps/api`: `pnpm test` (covers API and exercises runtime)

## Roadmap

- Streaming responses and request bodies end-to-end.
- Query/header validation and exposure on context.
- Optional auto-HEAD/OPTIONS support per-resource.
- Additional adapters (Fetch/WHATWG, edge runtimes).
- Enhanced diagnostics and dev tooling (pretty route table, 405 Allow header, etc.).

## Development notes

- Node: >= 20
- Package manager: PNPM
- TypeScript: 5.7+
- Builds use Vite with `vite-plugin-dts` for type emission.
