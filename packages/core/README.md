# Reono Core

**Reono** is an experimental library that enables you to define HTTP API endpoints using JSX syntax. The core package provides the JSX runtime, TypeScript definitions, and the efficient routing engine that powers the Reono ecosystem.

## Overview

The `reono` core package is responsible for:

- **JSX Runtime**: Provides the JSX configuration and runtime to transform JSX elements into route definitions
- **TypeScript Types**: Comprehensive type definitions for API context, handlers, validation, and JSX elements
- **Routing Engine**: High-performance trie-based router that efficiently matches HTTP requests to handlers
- **Middleware System**: Composable middleware pipeline for request processing
- **Validation Integration**: Schema-agnostic validation support that works with any validation library

## Installation

```bash
npm install reono
# or
pnpm add reono
# or
yarn add reono
```

## Basic Usage

Define your API routes using familiar JSX syntax:

```tsx
import { render } from 'reono';

const App = () => (
  <router path="api">
    <get path="users" handler={(c) => c.json([{ id: 1, name: "Alice" }])} />
    <post 
      path="users" 
      validate={{ body: userSchema }}
      handler={(c) => c.json({ id: 2, ...c.body })} 
    />
    <get 
      path="users/:id" 
      validate={{ params: z.object({ id: z.coerce.number() }) }}
      handler={(c) => c.json({ id: c.params.id, name: "User" })} 
    />
  </router>
);

// Convert JSX to a request handler
const handler = render(<App />);

// Use with any server (Node.js, Bun, Deno, etc.)
const response = await handler(request);
```

## JSX Elements

### `<router>`

Groups routes under a common path prefix.

```tsx
<router path="api/v1">
  {/* All child routes will be prefixed with /api/v1 */}
</router>
```

**Props:**
- `path?: string | string[]` - Path prefix for all child routes
- `children?: Element | Element[]` - Child route elements

### HTTP Method Elements

Define route handlers for specific HTTP methods.

```tsx
<get path="users" handler={(c) => c.json(users)} />
<post path="users" handler={(c) => createUser(c.body)} />
<put path="users/:id" handler={(c) => updateUser(c.params.id, c.body)} />
<delete path="users/:id" handler={(c) => deleteUser(c.params.id)} />
<patch path="users/:id" handler={(c) => patchUser(c.params.id, c.body)} />
```

**Props:**
- `path?: string | string[]` - Route path (supports parameters like `:id`)
- `handler?: ApiHandler` - Request handler function
- `validate?: ValidateSpec` - Validation schemas for request data

### `<use>`

Apply middleware to routes. Middleware runs before route handlers and can modify the request context.

```tsx
<use handler={authMiddleware}>
  <get path="protected" handler={(c) => c.json({ secret: "data" })} />
</use>
```

**Props:**
- `handler?: MiddlewareHandler` - Middleware function
- `children?: Element | Element[]` - Routes that will use this middleware

## API Context

Route handlers and middleware receive an `ApiContext` object:

```typescript
type ApiContext = {
  params: Record<string, any>;    // Route parameters (e.g., :id)
  body: any;                      // Parsed request body
  json: (data: unknown, init?: number | ResponseInit) => Response;
  req: Request;                   // Original Request object
  res?: Response;                 // Response object (if available)
};
```

## Validation

Reono supports schema-agnostic validation. Use any validation library that provides a `parse` method:

```tsx
import { z } from 'zod';

const userSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});

<post 
  path="users"
  validate={{
    body: userSchema,
    params: z.object({ id: z.coerce.number() }),
    query: z.object({ limit: z.coerce.number().optional() }),
    headers: z.object({ 'x-api-key': z.string() })
  }}
  handler={(c) => {
    // c.body, c.params, etc. are now type-safe and validated
  }}
/>
```

**ValidateSpec Properties:**
- `body?: Schema<T>` - Validate request body
- `params?: Schema<T>` - Validate route parameters
- `query?: Schema<T>` - Validate query parameters  
- `headers?: Schema<T>` - Validate request headers

## Middleware

Middleware functions receive the context and a `next` function:

```typescript
const logger: MiddlewareHandler = async (c, next) => {
  console.log(`${c.req.method} ${c.req.url}`);
  const result = await next();
  console.log('Request completed');
  return result;
};

const auth: MiddlewareHandler = async (c, next) => {
  const token = c.req.headers.get('authorization');
  if (!token) {
    return new Response('Unauthorized', { status: 401 });
  }
  return next();
};
```

## TypeScript Configuration

Configure your `tsconfig.json` to use Reono's JSX runtime:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "reono"
  }
}
```

Or use the classic JSX transform:

```json
{
  "compilerOptions": {
    "jsx": "react",
    "jsxFactory": "createElement"
  }
}
```

## Routing Features

### Path Parameters

```tsx
<get path="users/:userId/posts/:postId" handler={(c) => {
  const { userId, postId } = c.params;
  // ...
}} />
```

### Wildcards

```tsx
<get path="files/*" handler={(c) => {
  // Matches /files/any/nested/path
}} />
```

### Nested Routers

```tsx
<router path="api">
  <router path="v1">
    <get path="users" handler={getUsersV1} />
  </router>
  <router path="v2">
    <get path="users" handler={getUsersV2} />
  </router>
</router>
```

## Performance

Reono uses a highly optimized trie-based routing algorithm that provides:

- **O(1) average case** route matching
- **Minimal memory allocation** during request handling
- **Efficient parameter extraction** without regex parsing
- **Fast middleware composition** with zero-copy when possible

## Integration

The core package is framework-agnostic. Use it with:

- **Node.js** - with `@reono/node-server` or any Node.js server
- **Bun** - directly with Bun's native server
- **Deno** - with Deno's HTTP server
- **Cloudflare Workers** - as a fetch event handler
- **Vercel Edge Functions** - as an edge function handler

## Example: Complete API

```tsx
import { render } from 'reono';
import { z } from 'zod';

const userSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});

const logger = (c, next) => {
  console.log(`${c.req.method} ${c.req.url}`);
  return next();
};

const App = () => (
  <use handler={logger}>
    <router path="api/v1">
      <router path="users">
        <get path="" handler={(c) => c.json(getAllUsers())} />
        <post 
          path="" 
          validate={{ body: userSchema }}
          handler={(c) => c.json(createUser(c.body))} 
        />
        <get 
          path=":id"
          validate={{ params: z.object({ id: z.coerce.number() }) }}
          handler={(c) => c.json(getUser(c.params.id))} 
        />
        <put 
          path=":id"
          validate={{ 
            params: z.object({ id: z.coerce.number() }),
            body: userSchema 
          }}
          handler={(c) => c.json(updateUser(c.params.id, c.body))} 
        />
        <delete 
          path=":id"
          validate={{ params: z.object({ id: z.coerce.number() }) }}
          handler={(c) => deleteUser(c.params.id)} 
        />
      </router>
    </router>
  </use>
);

export default render(<App />);
```

## License

ISC

## Contributing

This is an experimental library. Contributions, feedback, and discussions are welcome!
