# Reono

Build HTTP APIs with JSX. Define routes, middleware, and validation using familiar JSX syntax, powered by a high‑performance runtime and pluggable server adapters.

> Status: Maturing. The core runtime, trie router, validation, and Node.js adapter are stable and well‑tested. Real‑world examples (Scenario‑1 and a Multi‑Tenant SaaS API Gateway in Scenario‑2) are included. Expect iterative improvements as we head toward v2.

## Why Reono?

- JSX‑first API design: Define routers, routes, and middleware declaratively
- Type‑safe: First‑class TypeScript with rich inference via schema validation
- Fast: Optimized trie‑based routing with O(1) average case matching
- Standards‑based: Built on Web APIs (Request, Response, Headers)
- Framework‑agnostic core, pluggable server adapters (Node HTTP available)
- Composable middleware with simple, predictable control‑flow

## Monorepo at a glance

- `packages/core` — Core JSX runtime, router, utilities, and tests
- `packages/node-server` — Node HTTP adapter (`@reono/node-server`)
- `apps/scenario-1` — Minimal example showing routing, middleware, and validation
- `apps/scenario-2` — Multi‑Tenant SaaS API Gateway (authZ/authN, tiered rate limiting, dynamic CORS, analytics & billing)
- `apps/api` — Additional sample/tests exercising core behavior
- `packages/ui`, `packages/eslint-config`, `packages/typescript-config` — Internal tooling and DX

## Quick start

### Install

```bash
npm install reono @reono/node-server
# or
pnpm add reono @reono/node-server
# or
yarn add reono @reono/node-server
```

### Basic example

```tsx
import { createApp } from "@reono/node-server";
import { z } from "zod";

// Define your API with JSX
const App = () => (
  <router path="api/v1">
    <get path="hello" handler={(c) => c.json({ message: "Hello, World!" })} />

    <router path="users">
      <get path="" handler={(c) => c.json(getAllUsers())} />
      <post
        path=""
        validate={{
          body: z.object({ name: z.string(), email: z.string().email() }),
        }}
        handler={(c) => c.json(createUser(c.body))}
      />
      <get
        path=":id"
        validate={{ params: z.object({ id: z.coerce.number() }) }}
        handler={(c) => c.json(getUser(c.params.id))}
      />
    </router>
  </router>
);

// Create and start server
const app = createApp();
app.serve(<App />);
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
```

### TypeScript configuration

Configure your `tsconfig.json` for JSX:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "reono"
  }
}
```

## Real‑world examples

- Scenario‑1: A focused starter demonstrating routing, validation, and middleware. See `apps/scenario-1`.
- Scenario‑2: A comprehensive Multi‑Tenant SaaS API Gateway. See `apps/scenario-2` for code, middleware, routers, and tests.

### SaaS API Gateway (Scenario‑2) highlights

- Multi‑tenant authentication, authorization, and request context
- Tiered rate limiting (Free, Premium, Enterprise) with per‑tenant isolation
- Dynamic CORS based on tenant configuration
- Feature routers: tenants, users, analytics, billing, and content
- Exhaustive integration + performance tests validating behavior and SLAs

Refer to the app’s README for local run instructions, example API keys, and test commands.

## Core concepts

### JSX elements

Reono provides intrinsic JSX elements for defining your API structure:

#### `<router>`

Groups routes under a common path prefix. Supports nesting for complex API structures.

```tsx
<router path="api/v1">
  <router path="users">{/* Routes nested under /api/v1/users */}</router>
</router>
```

#### HTTP method elements

Define route handlers for specific HTTP methods with full type safety.

```tsx
<get path="users" handler={(c) => c.json(users)} />
<post path="users" validate={{ body: userSchema }} handler={createUser} />
<put path="users/:id" handler={updateUser} />
<delete path="users/:id" handler={deleteUser} />
<patch path="users/:id" handler={patchUser} />
```

#### `<use>` — middleware

Apply middleware to routes with clean composition. Middleware runs in declaration order.

```tsx
<use handler={authMiddleware}>
  <use handler={loggingMiddleware}>
    <get path="protected" handler={protectedHandler} />
  </use>
</use>
```

### Path patterns

```tsx
{/* Static */}
<get path="users" />

{/* Params (captured in c.params) */}
<get path="users/:id" />
<get path="users/:userId/posts/:postId" />

{/* Wildcards (matches remaining path) */}
<get path="files/*" />
```

### Request context

```ts
type ApiContext = {
  params: Record<string, any>;
  body: any;
  req: Request;
  url: URL; // Parsed request URL
  state: Map<string, any>; // Per-request state bag
  res?: Response;
  json: (data: unknown, init?: ResponseInit) => Response;
};
```

### Validation & type safety

Use any validation library with a `parse` method (e.g. Zod) for runtime validation and compile‑time inference:

```tsx
import { z } from "zod";

const userSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  age: z.number().min(0).optional(),
});

<post
  path="users"
  validate={{
    body: userSchema,
    params: z.object({ id: z.coerce.number() }),
  }}
  handler={(c) => c.json(createUser(c.body), 201)}
/>;
```

### Middleware system

Create reusable middleware with the Koa‑style `(context, next)` pattern:

```ts
import { type MiddlewareHandler } from "reono";

const logger: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  const result = await next();
  console.log(`← ${c.req.method} ${c.req.url} (${Date.now() - start}ms)`);
  return result;
};

const auth: MiddlewareHandler = async (c, next) => {
  const token = c.req.headers.get("authorization");
  if (!token) return new Response("Unauthorized", { status: 401 });
  return next();
};
```

## Complete example

```tsx
import { createApp } from "@reono/node-server";
import { type MiddlewareHandler, CORS } from "reono";
import { z } from "zod";

const userSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["user", "admin"]).default("user"),
});
const userUpdateSchema = userSchema.partial();

let users = [
  { id: 1, name: "Alice", email: "alice@example.com", role: "admin" },
  { id: 2, name: "Bob", email: "bob@example.com", role: "user" },
];

const logger: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  const result = await next();
  console.log(`← ${c.req.method} ${c.req.url} (${Date.now() - start}ms)`);
  return result;
};

const getAllUsers = (c) => c.json(users);
const getUser = (c) => {
  const user = users.find((u) => u.id === c.params.id);
  if (!user) return new Response("User not found", { status: 404 });
  return c.json(user);
};
const createUser = (c) => {
  const newUser = { id: Date.now(), ...c.body };
  users.push(newUser);
  return c.json(newUser, 201);
};
const updateUser = (c) => {
  const index = users.findIndex((u) => u.id === c.params.id);
  if (index === -1) return new Response("User not found", { status: 404 });
  users[index] = { ...users[index], ...c.body };
  return c.json(users[index]);
};
const deleteUser = (c) => {
  const index = users.findIndex((u) => u.id === c.params.id);
  if (index === -1) return new Response("User not found", { status: 404 });
  users.splice(index, 1);
  return new Response(null, { status: 204 });
};

const App = () => (
  <CORS origins={["*"]} headers={["Content-Type", "Authorization"]}>
    <use handler={logger}>
      <router path="api/v1">
        <get
          path="health"
          handler={(c) => c.json({ status: "ok", timestamp: Date.now() })}
        />
        <router path="users">
          <get path="" handler={getAllUsers} />
          <get
            path=":id"
            validate={{ params: z.object({ id: z.coerce.number() }) }}
            handler={getUser}
          />
          <post path="" validate={{ body: userSchema }} handler={createUser} />
          <put
            path=":id"
            validate={{
              params: z.object({ id: z.coerce.number() }),
              body: userUpdateSchema,
            }}
            handler={updateUser}
          />
          <delete
            path=":id"
            validate={{ params: z.object({ id: z.coerce.number() }) }}
            handler={deleteUser}
          />
        </router>
      </router>
    </use>
  </CORS>
);

const app = createApp();
app.serve(<App />);
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
```

## Intrinsic elements and props

- `<router path>`: groups child routes under a path prefix. `path` can be string or array. Supports nested routers.
- `<use handler>`: middleware. Runs outer‑to‑inner and unwinds inner‑to‑outer. Multiple nested `use` stack.
- HTTP routes: `<get|post|put|delete|patch path handler validate?>`
  - `path` supports:
    - Static: `users`
    - Params: `:id` (captured in `c.params`, optionally coerced via `validate.params`)
    - Wildcard: `*` (consumes the remainder)
  - `validate` (optional): `{ body?, query?, params?, headers? }` where each is a schema‑like object with `parse(input)` (e.g. Zod). On success, values are replaced in `c.body`, `c.params`, etc. On failure, the runtime responds 400 with a JSON error payload.

## Runtime semantics

- Methods: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `OPTIONS`, `HEAD`. Only the five route tags are supported in JSX; `OPTIONS`/`HEAD` return 405 unless explicitly routed.
- Matching & normalization:
  - Leading/trailing/multiple slashes are normalized.
  - Static segments take precedence over params at the same depth (`/users/me` beats `/users/:id`).
  - `*` wildcard matches the remainder.
- 404 vs 405:
  - Unknown path → 404 Not Found.
  - Known path without a handler for the method → 405 Method Not Allowed (plain text).
- Middleware composition:
  - Koa‑style `(ctx, next)`; order is declaration order.
  - Calling `next()` multiple times is guarded (500).
  - Middleware may short‑circuit by returning a `Response`.
- Body parsing (by `Content-Type`):
  - `application/json` → parsed JSON (invalid JSON → 400).
  - `text/*` → string via `req.text()`.
  - `application/x-www-form-urlencoded` → plain object from `FormData`.
- Context and responses:
  - `c` includes `{ params, body, req, url, state, res?, json(data, init?) }`.
  - `c.json()` sets `content-type: application/json; charset=utf-8` and optional status.
  - Handlers may return a `Response` directly; it is passed through unchanged.
  - If no handler or middleware writes a response, a default `200` with JSON `null` is returned.

## Utilities (sugar elements)

Convenience components built on top of `<use>` for common patterns. Import from `reono`:

```ts
import { CORS, RateLimit, Guard, Static, FileUpload, Transform } from "reono";
```

### CORS

Preflight + headers with a single wrapper (OPTIONS routes are injected automatically for matched paths):

```tsx
<CORS
  origins={["https://app.example.com", "https://admin.example.com"]}
  methods={["GET", "POST", "PUT", "DELETE"]}
  headers={["Content-Type", "Authorization"]}
  credentials
  maxAge={86400}
>
  <router path="api">{/** your routes */}</router>
</CORS>
```

### RateLimit

Apply rate limits per IP or custom key (e.g., API key or tenant ID). Headers are added to responses automatically:

```tsx
<RateLimit
  requests={100}
  window={60_000}
  keyGen={(c) =>
    c.req.headers.get("x-api-key") ??
    c.req.headers.get("x-forwarded-for") ??
    "anonymous"
  }
>
  <router path="api">{/** rate‑limited routes */}</router>
</RateLimit>
```

### Guard

Conditionally allow access. Useful for auth checks and feature flags:

```tsx
<Guard
  condition={(c) => c.state.get("user")?.role === "admin"}
  fallback={(c) => c.json({ error: "Admin required" }, 403)}
>
  <router path="admin">{/** admin routes */}</router>
</Guard>
```

### Transform

Post‑process responses (add headers, wrap payloads, etc.):

```tsx
<Transform
  transform={(out) =>
    out instanceof Response
      ? out
      : { data: out, requestId: crypto.randomUUID() }
  }
>
  <router path="api">{/** all responses wrapped */}</router>
</Transform>
```

### Static

Serve static assets at a mount point; can be wrapped with auth middleware:

```tsx
<Static path="/assets" directory="./public" />

<Static path="/uploads" directory="./uploads" middleware={[authMiddleware]} />
```

### FileUpload

Validate uploads (size and type) and access parsed files from `c.state`:

```tsx
<FileUpload
  maxSize={10 * 1024 * 1024}
  allowedTypes={["image/jpeg", "image/png"]}
>
  <post
    path="upload"
    handler={(c) => c.json({ uploaded: c.state.get("uploadedFileCount") })}
  />
</FileUpload>
```

See tested examples in `packages/core/__tests__/utilities/` and Scenario‑2 for multi‑tenant patterns using these utilities together.

## Adapter: Node HTTP (`@reono/node-server`)

- `createApp()` returns `{ serve(element), listen(port, cb?), close() }`.
- `serve(element)` builds the trie and stores a fetch‑compatible handler.
- `listen(port)` wires Node’s `http.createServer` to translate `IncomingMessage` → Fetch `Request` and write back the Fetch `Response`.

## Testing

The repository includes extensive tests:

- Core/unit tests in `packages/core/__tests__`
- Example‑level integration and performance tests in `apps/scenario-1` and `apps/scenario-2`
- Additional sample tests in `apps/api`

See each app’s README for scripts and commands to run locally. All scenarios are wired to validate 404/405 behavior, normalization, validation, middleware semantics, and performance characteristics.

## Roadmap

- Developer experience: richer response helpers (text, HTML, redirects, streaming), query/headers/cookies, better error messages
- Ecosystem: more utility components, static/caching improvements
- Adapters: Bun, Deno, Cloudflare Workers, Vercel Edge
- OpenAPI: schema generation and docs tooling
- Performance: streaming, caching, compression

## License

ISC

—

Reono — Build HTTP APIs with the power and familiarity of JSX.
