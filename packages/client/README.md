# @reono/client

A Vite plugin that generates type-safe REST clients from your Reono JSX API definitions.

## Why @reono/client?

- **🔒 Compile-time type safety**: Your frontend code knows exactly what endpoints exist and their parameter requirements
- **🚀 Zero runtime overhead**: All type checking happens at build time
- **🔄 Always in sync**: Client types are automatically generated from your server API definition
- **💡 Great DX**: Full IntelliSense support with auto-completion and error detection
- **🎯 Framework agnostic**: Works with any frontend framework (React, Vue, Svelte, etc.)

## Quick Start

### 1. Install

```bash
npm install @reono/client
# or
pnpm add @reono/client
```

### 2. Configure Vite Plugin

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { reonoClient } from "@reono/client/plugin";

export default defineConfig({
  plugins: [
    reonoClient({
      serverFile: "./src/api/server.tsx", // Your Reono API definition
      outputDir: "./src/generated", // Where to generate the client
      clientName: "api", // Name of the generated client
      baseUrl: "http://localhost:3000", // Default base URL
    }),
  ],
});
```

### 3. Create Your API Definition

```tsx
// src/api/server.tsx
import { z } from "zod";

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});

export const ApiServer = () => (
  <router path="api/v1">
    {/* Health check */}
    <get path="health" handler={(c) => c.json({ status: "ok" })} />

    {/* Users */}
    <get path="users" handler={getUsers} />
    <post path="users" validate={{ body: UserSchema }} handler={createUser} />
    <get
      path="users/:id"
      validate={{ params: z.object({ id: z.string() }) }}
      handler={getUser}
    />
    <put
      path="users/:id"
      validate={{ params: z.object({ id: z.string() }), body: UserSchema }}
      handler={updateUser}
    />
  </router>
);
```

### 4. Use the Generated Client

```ts
// src/app.ts
import { api } from "./generated/api";

// ✅ Fully type-safe API calls
async function example() {
  // Simple GET - no params required
  const health = await api.get("/api/v1/health");

  // GET with required params - TypeScript enforces them
  const user = await api.get("/api/v1/users/:id", {
    params: { id: "123" }, // ✅ Required and typed
  });

  // POST with typed body
  const newUser = await api.post("/api/v1/users", {
    body: {
      name: "John",
      email: "john@example.com",
    },
  });

  // ❌ These would be COMPILE ERRORS:
  // await api.get('/nonexistent');           // Invalid path
  // await api.get('/api/v1/users/:id');      // Missing required params
  // await api.get('/api/v1/users/:id', {     // Wrong param name
  //   params: { userId: '123' }
  // });
}
```

## How It Works

1. **Build-time Analysis**: The Vite plugin analyzes your JSX API definition during the build process
2. **Route Extraction**: It extracts all routes, parameters, and validation schemas
3. **Type Generation**: TypeScript definitions are generated for all endpoints
4. **Client Creation**: A fully typed client is generated with methods for each endpoint
5. **Runtime Safety**: The generated client handles all HTTP details while maintaining type safety

This approach provides true compile-time type safety without runtime overhead, ensuring your frontend and backend stay perfectly in sync.

- **Simple API**: Provides a clean, minimal interface for serving Reono applications
- **Error Handling**: Built-in error handling for unhandled exceptions
- **Streaming Support**: Handles request/response streaming efficiently

## Installation

```bash
npm install @reono/node-server reono
# or
pnpm add @reono/node-server reono
# or
yarn add @reono/node-server reono
```

## Basic Usage

```tsx
import { createApp } from "@reono/node-server";

const App = () => (
  <router path="api">
    <get path="hello" handler={(c) => c.json({ message: "Hello, World!" })} />
    <get path="users/:id" handler={(c) => c.json({ id: c.params.id })} />
  </router>
);

const app = createApp();

// Register your Reono JSX app
app.serve(<App />);

// Start the HTTP server
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
```

## API Reference

### `createApp()`

Creates a new Reono application instance for Node.js.

```typescript
const app = createApp();
```

**Returns:** An application instance with the following methods:

#### `app.serve(element: JSXElement)`

Registers a Reono JSX element tree as the application handler.

```tsx
app.serve(<App />);
```

**Parameters:**

- `element: JSXElement` - The root JSX element of your Reono application

**Note:** This method must be called before `listen()`.

#### `app.listen(port: number, callback?: () => void)`

Starts the HTTP server on the specified port.

```typescript
app.listen(3000, () => {
  console.log("Server started!");
});
```

**Parameters:**

- `port: number` - The port number to listen on
- `callback?: () => void` - Optional callback executed when the server starts

**Throws:** Error if `serve()` hasn't been called first.

#### `app.close(callback?: (err?: Error) => void)`

Stops the HTTP server.

```typescript
app.close((err) => {
  if (err) console.error("Error closing server:", err);
  else console.log("Server closed");
});
```

**Parameters:**

- `callback?: (err?: Error) => void` - Optional callback executed when the server closes

## Complete Example

```tsx
// server.tsx
import { createApp } from "@reono/node-server";
import { z } from "zod";

const userSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});

// Mock data store
let users = [
  { id: 1, name: "Alice", email: "alice@example.com" },
  { id: 2, name: "Bob", email: "bob@example.com" },
];

const logger = (c, next) => {
  console.log(`${new Date().toISOString()} ${c.req.method} ${c.req.url}`);
  return next();
};

const App = () => (
  <use handler={logger}>
    <router path="api/v1">
      <router path="users">
        {/* GET /api/v1/users */}
        <get path="" handler={(c) => c.json(users)} />

        {/* POST /api/v1/users */}
        <post
          path=""
          validate={{ body: userSchema }}
          handler={(c) => {
            const newUser = { id: Date.now(), ...c.body };
            users.push(newUser);
            return c.json(newUser, 201);
          }}
        />

        {/* GET /api/v1/users/:id */}
        <get
          path=":id"
          validate={{ params: z.object({ id: z.coerce.number() }) }}
          handler={(c) => {
            const user = users.find((u) => u.id === c.params.id);
            if (!user) {
              return new Response("User not found", { status: 404 });
            }
            return c.json(user);
          }}
        />

        {/* PUT /api/v1/users/:id */}
        <put
          path=":id"
          validate={{
            params: z.object({ id: z.coerce.number() }),
            body: userSchema,
          }}
          handler={(c) => {
            const index = users.findIndex((u) => u.id === c.params.id);
            if (index === -1) {
              return new Response("User not found", { status: 404 });
            }
            users[index] = { id: c.params.id, ...c.body };
            return c.json(users[index]);
          }}
        />

        {/* DELETE /api/v1/users/:id */}
        <delete
          path=":id"
          validate={{ params: z.object({ id: z.coerce.number() }) }}
          handler={(c) => {
            const index = users.findIndex((u) => u.id === c.params.id);
            if (index === -1) {
              return new Response("User not found", { status: 404 });
            }
            users.splice(index, 1);
            return new Response("", { status: 204 });
          }}
        />
      </router>
    </router>
  </use>
);

const app = createApp();
app.serve(<App />);

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📚 API available at http://localhost:${PORT}/api/v1/users`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down server...");
  app.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});
```

## Environment Setup

### TypeScript Configuration

Make sure your `tsconfig.json` is configured for Reono:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "jsx": "react-jsx",
    "jsxImportSource": "reono",
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

### Package.json Scripts

```json
{
  "scripts": {
    "dev": "tsx watch src/server.tsx",
    "start": "node dist/server.js",
    "build": "tsc && node dist/server.js"
  },
  "dependencies": {
    "@reono/node-server": "^1.0.0",
    "reono": "^1.0.0"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "typescript": "^5.0.0"
  }
}
```

## Development vs Production

### Development

Use `tsx` for development with hot reloading:

```bash
npx tsx watch src/server.tsx
```

### Production

Compile TypeScript and run the compiled JavaScript:

```bash
tsc
node dist/server.js
```

## Error Handling

The node-server package includes built-in error handling:

- **Unhandled Errors**: Automatically caught and converted to 500 responses
- **Request Processing**: Errors during request/response conversion are handled gracefully
- **Validation Errors**: Reono's validation errors are properly formatted as 400 responses

For custom error handling, implement it in your route handlers or middleware:

```tsx
const errorHandler = async (c, next) => {
  try {
    return await next();
  } catch (error) {
    console.error("Route error:", error);
    return c.json({ error: "Something went wrong" }, 500);
  }
};

const App = () => <use handler={errorHandler}>{/* Your routes */}</use>;
```

## Request/Response Conversion

The package handles conversion between Node.js and Web API standards:

### Request Conversion

- Converts Node.js `IncomingMessage` to Web API `Request`
- Handles headers, method, URL, and body streaming
- Supports both HTTP and HTTPS
- Automatically detects protocol from socket encryption

### Response Conversion

- Converts Web API `Response` to Node.js HTTP response
- Transfers status, headers, and body
- Handles streaming and buffering appropriately
- Sets appropriate `Content-Length` headers

## Performance Considerations

- **Streaming**: Request bodies are streamed using Node.js streams converted to Web streams
- **Memory**: Response bodies are currently buffered for simplicity (streaming support planned)
- **Headers**: Efficient header conversion between Node.js and Web API formats
- **Error Handling**: Minimal performance impact from error boundaries

## Compatibility

- **Node.js**: Requires Node.js 18+ (for Web API support)
- **TypeScript**: Full TypeScript support with comprehensive type definitions
- **ESM/CJS**: Supports both ES modules and CommonJS
- **Reono**: Compatible with all Reono core features

## Deployment

### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/
EXPOSE 3000

CMD ["node", "dist/server.js"]
```

### Environment Variables

```bash
PORT=3000
NODE_ENV=production
```

## License

ISC

## Contributing

This package is part of the experimental Reono ecosystem. Contributions and feedback are welcome!
