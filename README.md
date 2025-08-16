# Reono

**Build HTTP APIs with JSX.** Define routes, middleware, and validation using familiar JSX syntax, powered by a high-performance runtime and pluggable server adapters.

> **Status**: Experimental. Core runtime, trie-based router, validation system, and Node.js adapter are functional. Expect breaking changes as we iterate toward v2.0.

## Why Reono?

- **Familiar Syntax**: Use JSX to define your API routes and middleware
- **Type Safety**: Full TypeScript support with comprehensive type inference
- **High Performance**: Optimized trie-based routing with O(1) average case matching
- **Web Standards**: Built on modern Web APIs (Request/Response, Headers, etc.)
- **Framework Agnostic**: Core library works with any JavaScript runtime
- **Composable**: Powerful middleware system with clean composition patterns

## Quick Start

### Installation

```bash
npm install reono @reono/node-server
# or
pnpm add reono @reono/node-server
# or
yarn add reono @reono/node-server
```

### Basic Example

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

### TypeScript Configuration

Configure your `tsconfig.json` for JSX:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "reono"
  }
}
```

## Core Concepts

### JSX Elements

Reono provides intrinsic JSX elements for defining your API structure:

#### `<router>`

Groups routes under a common path prefix. Supports nesting for complex API structures.

```tsx
<router path="api/v1">
  <router path="users">{/* Routes nested under /api/v1/users */}</router>
</router>
```

#### HTTP Method Elements

Define route handlers for specific HTTP methods with full type safety.

```tsx
<get path="users" handler={(c) => c.json(users)} />
<post path="users" validate={{ body: userSchema }} handler={createUser} />
<put path="users/:id" handler={updateUser} />
<delete path="users/:id" handler={deleteUser} />
<patch path="users/:id" handler={patchUser} />
```

#### `<use>` - Middleware

Apply middleware to routes with clean composition. Middleware runs in declaration order.

```tsx
<use handler={authMiddleware}>
  <use handler={loggingMiddleware}>
    <get path="protected" handler={protectedHandler} />
  </use>
</use>
```

### Path Patterns

Reono supports flexible path patterns for routing:

```tsx
{/* Static paths */}
<get path="users" />

{/* Parameters (captured in c.params) */}
<get path="users/:id" />
<get path="users/:userId/posts/:postId" />

{/* Wildcards (matches remaining path) */}
<get path="files/*" />
```

### Request Context

Route handlers receive a rich context object with request data and response helpers:

```typescript
type ApiContext = {
  params: Record<string, any>; // Route parameters (:id, etc.)
  body: any; // Parsed request body
  req: Request; // Original Web API Request
  res?: Response; // Response object (if set)

  // Response helpers
  json: (data: unknown, init?: ResponseInit) => Response;
};
```

### Validation & Type Safety

Use any validation library with a `parse` method (Zod, Joi, etc.) for runtime validation and compile-time type inference:

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
    body: userSchema, // Validates request body
    params: z.object({ id: z.coerce.number() }), // Validates path params
    // query and headers validation coming soon
  }}
  handler={(c) => {
    // c.body is now typed as { name: string, email: string, age?: number }
    const user = createUser(c.body);
    return c.json(user, 201);
  }}
/>;
```

### Middleware System

Create reusable middleware with the Koa-style `(context, next)` pattern:

```typescript
import { type MiddlewareHandler } from "reono";

const logger: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  console.log(`→ ${c.req.method} ${c.req.url}`);

  const result = await next();

  const duration = Date.now() - start;
  console.log(`← ${c.req.method} ${c.req.url} (${duration}ms)`);

  return result;
};

const auth: MiddlewareHandler = async (c, next) => {
  const token = c.req.headers.get("authorization");
  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }
  // Add user to context, continue to next middleware/handler
  return next();
};
```

## Complete Example

Here's a full CRUD API with authentication, logging, and validation:

```tsx
import { createApp } from "@reono/node-server";
import { type MiddlewareHandler } from "reono";
import { z } from "zod";

// Schemas
const userSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["user", "admin"]).default("user"),
});

const userUpdateSchema = userSchema.partial();

// Mock database
let users = [
  { id: 1, name: "Alice", email: "alice@example.com", role: "admin" },
  { id: 2, name: "Bob", email: "bob@example.com", role: "user" },
];

// Middleware
const logger: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  console.log(`→ ${c.req.method} ${c.req.url}`);
  const result = await next();
  console.log(`← ${c.req.method} ${c.req.url} (${Date.now() - start}ms)`);
  return result;
};

const cors: MiddlewareHandler = async (c, next) => {
  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  const response = await next();
  if (response instanceof Response) {
    response.headers.set("Access-Control-Allow-Origin", "*");
  }
  return response;
};

// Route handlers
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

// API Definition
const App = () => (
  <use handler={cors}>
    <use handler={logger}>
      <router path="api/v1">
        {/* Health check */}
        <get
          path="health"
          handler={(c) => c.json({ status: "ok", timestamp: Date.now() })}
        />

        {/* User routes */}
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
  </use>
);

// Server setup
const app = createApp();
app.serve(<App />);

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📚 Try: http://localhost:${PORT}/api/v1/users`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down...");
  app.close(() => process.exit(0));
});
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

## Adapter: Node HTTP (`@reono/node-server`)

- `createApp()` returns `{ serve(element), listen(port, cb?), close() }`.
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

Reono is actively developed with these upcoming features:

### Phase 1: Enhanced Core API

- **Complete request data access**: Query parameters, headers, cookies
- **Additional response helpers**: Text, HTML, redirects, streaming
- **Standard Schema support**: Work with any validation library
- **Enhanced body parsing**: File uploads, multipart, binary data

### Phase 2: Developer Experience

- **Utility components**: CORS, rate limiting, file uploads, static serving
- **Enhanced path patterns**: Regex constraints, optional parameters
- **Development tools**: Better error messages, request logging
- **Documentation**: Comprehensive guides and examples

### Phase 3: Advanced Features

- **Real-time support**: WebSockets, Server-Sent Events
- **Additional adapters**: Bun, Deno, Cloudflare Workers, Vercel Edge
- **OpenAPI integration**: Auto-generated documentation
- **Performance optimizations**: Streaming, caching, compression

## Contributing

Reono is experimental and welcomes contributions! Key areas:

- **Core runtime improvements**: Performance, features, bug fixes
- **New server adapters**: Support for additional runtimes
- **Developer tooling**: Better DX, debugging, error handling
- **Documentation**: Examples, guides, API reference
- **Testing**: More comprehensive test coverage

## License

ISC

---

**Reono** - Build HTTP APIs with the power and familiarity of JSX. ⚡
