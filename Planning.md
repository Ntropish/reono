# Reono MVP Implementation Plan

## Project Overview

**Reono** is an experimental library that enables developers to define HTTP API endpoints using JSX syntax. The library leverages modern Web APIs and provides a type-safe, composable approach to building HTTP services.

### Core Architecture Principles

- **Intrinsic Elements**: Core JSX elements handled directly by the runtime (`<router>`, `<get>`, `<post>`, `<use>`, etc.)
- **Utility Components**: Convenience components built from intrinsic elements for common patterns (sugar/boilerplate reduction)
- **Middleware via `<use>`**: All middleware applications go through the existing `<use>` element
- **Standard Schema**: Support standard schema interface for maximum flexibility while preserving type safety
- **Web API Compliance**: Full compliance with modern Web API standards throughout the system

---

## Current State Analysis

### ✅ Currently Implemented
- Basic JSX element definitions (`<router>`, `<get>`, `<post>`, `<put>`, `<delete>`, `<patch>`)
- Trie-based routing with path parameters (`:id`)
- Basic middleware composition via `<use>` element
- JSON body parsing and validation
- Simple response helpers (`c.json()`)
- Basic ApiContext with `params`, `body`, `req`, and `json()` helper
- Node.js server adapter for hosting

### ❌ Missing for MVP
- Enhanced request data access (query, headers, cookies)
- Additional response helpers (text, html, redirect, streaming)
- Standard schema support
- Enhanced body parsing (FormData, ArrayBuffer, multipart)
- File upload handling
- Static file serving
- Common utility components for typical use cases

---

## Phase 1: Enhanced Core API (MVP)

### 1.1 Enhanced ApiContext

**Goal**: Provide complete access to request data and enhanced response capabilities

```typescript
export type ApiContext = {
  // Request data
  params: Record<string, any>;        // Existing: Route parameters
  body: any;                          // Existing: Parsed request body
  query: URLSearchParams;             // NEW: Query parameters
  headers: Headers;                   // NEW: Request headers  
  cookies: Map<string, string>;       // NEW: Cookie parsing
  url: URL;                          // NEW: Parsed URL object
  req: Request;                      // Existing: Original Request object
  res?: Response;                    // Existing: Response object (if available)
  state: Map<string, any>;           // NEW: Middleware state sharing
  
  // Response helpers
  json: (data: unknown, init?: number | ResponseInit) => Response;           // Existing
  text: (data: string, init?: number | ResponseInit) => Response;            // NEW
  html: (data: string, init?: number | ResponseInit) => Response;            // NEW
  redirect: (url: string, status?: number) => Response;                      // NEW
  stream: (stream: ReadableStream, init?: ResponseInit) => Response;         // NEW
  file: (data: ArrayBuffer | Uint8Array, filename?: string, init?: ResponseInit) => Response; // NEW
};
```

**Implementation Files**:
- `packages/core/src/components/index.ts` - Update ApiContext type
- `packages/core/src/runtime/pipeline.ts` - Enhance buildContext function
- `packages/core/src/runtime/pipeline.ts` - Add new response helper functions

### 1.2 Standard Schema Support

**Goal**: Support multiple validation libraries while maintaining type safety

```typescript
// Support standard schema interface + backward compatibility
export type StandardSchema<T = unknown> = {
  '~standard': {
    version: 1;
    vendor: string;
    validate: (value: unknown) => { success: true; data: T } | { success: false; issues: any[] };
  };
} | {
  parse: (input: unknown) => T; // Backward compatibility with current Zod-style
} | {
  safeParse: (input: unknown) => { success: true; data: T } | { success: false; error: any };
};

// Enhanced type inference
export type InferFromSchema<S> =
  S extends StandardSchema<infer T> ? T : 
  S extends { parse: (input: unknown) => infer T } ? T :
  S extends { safeParse: (input: unknown) => { success: true; data: infer T } } ? T :
  unknown;

// Enhanced validation spec
export type ValidateSpec = {
  body?: StandardSchema<any>;
  params?: StandardSchema<any>;
  query?: StandardSchema<any>;         // NEW
  headers?: StandardSchema<any>;       // NEW
  cookies?: StandardSchema<any>;       // NEW
  custom?: (c: ApiContext) => void | Promise<void>; // NEW: Custom validation
};
```

**Implementation Files**:
- `packages/core/src/components/index.ts` - Update validation types
- `packages/core/src/runtime/pipeline.ts` - Update applyValidation function
- `packages/core/src/index.ts` - Update exported types

### 1.3 Enhanced Body Parsing

**Goal**: Support all common content types including file uploads

```typescript
export async function buildContext(req: Request): Promise<ApiContext> {
  const url = new URL(req.url);
  const query = url.searchParams;
  const headers = req.headers;
  const cookies = parseCookies(req.headers.get('cookie') || '');
  const state = new Map<string, any>();
  
  let parsedBody: any = undefined;
  const ct = req.headers.get("content-type") || "";
  
  if (req.method !== "GET" && req.method !== "HEAD") {
    if (/application\/json/i.test(ct)) {
      parsedBody = await req.json();
    } else if (/text\//i.test(ct)) {
      parsedBody = await req.text();
    } else if (/application\/x-www-form-urlencoded/i.test(ct)) {
      const form = await req.formData();
      parsedBody = Object.fromEntries(form.entries());
    } else if (/multipart\/form-data/i.test(ct)) {
      parsedBody = await req.formData(); // Keep as FormData for file uploads
    } else {
      parsedBody = await req.arrayBuffer(); // Raw binary data
    }
  }
  
  return {
    params: {},
    body: parsedBody,
    query,
    headers,
    cookies,
    url,
    req,
    state,
    // Response helpers
    json: (data, init) => jsonResponder(data, init),
    text: (data, init) => textResponder(data, init),
    html: (data, init) => htmlResponder(data, init),
    redirect: (url, status = 302) => new Response(null, { status, headers: { Location: url } }),
    stream: (stream, init) => new Response(stream, init),
    file: (data, filename, init) => fileResponder(data, filename, init)
  };
}
```

**Implementation Files**:
- `packages/core/src/runtime/pipeline.ts` - Enhance buildContext function
- `packages/core/src/runtime/pipeline.ts` - Add new response helper functions
- Add utility functions for cookie parsing and MIME type detection

---

## Phase 2: Utility Components (Sugar Elements)

**Goal**: Provide convenience components for common patterns built on top of the `<use>` element

### 2.1 Guard Component

**Purpose**: Middleware with clean API for conditional access control

```tsx
// Utility component built from <use>
export const Guard = ({ condition, children, fallback }) => {
  const guardMiddleware = async (c, next) => {
    const shouldAllow = typeof condition === 'function' 
      ? await condition(c) 
      : condition;
      
    if (!shouldAllow) {
      return fallback 
        ? (typeof fallback === 'function' ? fallback(c) : fallback)
        : new Response('Forbidden', { status: 403 });
    }
    
    return next();
  };
  
  return <use handler={guardMiddleware}>{children}</use>;
};

// Usage examples
<Guard condition={(c) => c.headers.get('x-api-version') === 'v2'}>
  <get path="users" handler={getUsersV2} />
</Guard>

<Guard 
  condition={(c) => c.state.get('user')?.role === 'admin'}
  fallback={(c) => c.json({ error: 'Admin required' }, 403)}
>
  <router path="admin">
    {/* Admin routes */}
  </router>
</Guard>
```

### 2.2 CORS Component

**Purpose**: Cross-origin resource sharing with clean configuration

```tsx
export const CORS = ({ origins, methods, headers, credentials, children }) => {
  const corsMiddleware = async (c, next) => {
    const origin = c.req.headers.get('origin');
    
    // Handle preflight OPTIONS requests
    if (c.req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origins.includes(origin) ? origin : origins[0],
          'Access-Control-Allow-Methods': methods.join(', '),
          'Access-Control-Allow-Headers': headers.join(', '),
          'Access-Control-Allow-Credentials': credentials.toString()
        }
      });
    }
    
    const response = await next();
    if (response instanceof Response) {
      response.headers.set('Access-Control-Allow-Origin', 
        origins.includes(origin) ? origin : origins[0]);
      if (credentials) {
        response.headers.set('Access-Control-Allow-Credentials', 'true');
      }
    }
    return response;
  };
  
  return <use handler={corsMiddleware}>{children}</use>;
};

// Usage
<CORS origins={['http://localhost:3000']} methods={['GET', 'POST']} credentials={true}>
  <router path="api">
    {/* API routes with CORS */}
  </router>
</CORS>
```

### 2.3 Transform Component

**Purpose**: Response transformation middleware

```tsx
export const Transform = ({ transform, children }) => {
  const transformMiddleware = async (c, next) => {
    const response = await next();
    return typeof transform === 'function' ? transform(response, c) : response;
  };
  
  return <use handler={transformMiddleware}>{children}</use>;
};

// Usage
<Transform transform={(response, c) => {
  if (response instanceof Response) {
    response.headers.set('X-Custom-Header', 'processed');
    response.headers.set('X-Request-ID', crypto.randomUUID());
  }
  return response;
}}>
  <get path="data" handler={getDataHandler} />
</Transform>
```

### 2.4 Static File Component

**Purpose**: Static file serving with optional middleware

```tsx
export const Static = ({ path, directory, middleware = [] }) => {
  const staticHandler = async (c) => {
    const filePath = c.params.filepath || '';
    const fullPath = join(directory, filePath);
    
    // Security: prevent directory traversal
    if (!fullPath.startsWith(resolve(directory))) {
      return new Response('Forbidden', { status: 403 });
    }
    
    try {
      const file = await readFile(fullPath);
      const mimeType = getMimeType(fullPath);
      return new Response(file, {
        headers: { 'Content-Type': mimeType }
      });
    } catch {
      return new Response('Not Found', { status: 404 });
    }
  };
  
  const StaticRoute = () => <get path={`${path}/*filepath`} handler={staticHandler} />;
  
  // Apply middleware if provided
  if (middleware.length > 0) {
    return middleware.reduceRight(
      (acc, mw) => <use handler={mw}>{acc}</use>,
      <StaticRoute />
    );
  }
  
  return <StaticRoute />;
};

// Usage
<Static path="/assets" directory="./public" />
<Static 
  path="/uploads" 
  directory="./uploads" 
  middleware={[authMiddleware]} 
/>
```

### 2.5 File Upload Component

**Purpose**: File upload validation and processing

```tsx
export const FileUpload = ({ maxSize, allowedTypes, children }) => {
  const uploadMiddleware = async (c, next) => {
    if (!(c.body instanceof FormData)) {
      return c.json({ error: 'Expected multipart/form-data' }, 400);
    }
    
    const files = [];
    for (const [key, value] of c.body.entries()) {
      if (value instanceof File) {
        if (maxSize && value.size > maxSize) {
          return c.json({ error: `File ${value.name} too large` }, 400);
        }
        if (allowedTypes && !allowedTypes.includes(value.type)) {
          return c.json({ error: `File type ${value.type} not allowed` }, 400);
        }
        files.push({ key, file: value });
      }
    }
    
    c.state.set('uploadedFiles', files);
    return next();
  };
  
  return <use handler={uploadMiddleware}>{children}</use>;
};

// Usage
<FileUpload maxSize={10 * 1024 * 1024} allowedTypes={['image/jpeg', 'image/png']}>
  <post path="upload" handler={(c) => {
    const files = c.state.get('uploadedFiles');
    // Process files...
    return c.json({ uploaded: files.length });
  }} />
</FileUpload>
```

### 2.6 Rate Limiting Component

**Purpose**: Request rate limiting

```tsx
export const RateLimit = ({ requests, window, keyGen, children }) => {
  const rateLimitMiddleware = async (c, next) => {
    const key = keyGen ? keyGen(c) : c.req.headers.get('x-forwarded-for') || 'default';
    
    // Rate limiting logic (could use external store like Redis)
    const allowed = await checkRateLimit(key, requests, window);
    
    if (!allowed) {
      return c.json({ error: 'Rate limit exceeded' }, 429);
    }
    
    return next();
  };
  
  return <use handler={rateLimitMiddleware}>{children}</use>;
};

// Usage
<RateLimit 
  requests={100} 
  window={60000} 
  keyGen={(c) => c.headers.get('x-api-key')}
>
  <router path="api">
    {/* Rate limited routes */}
  </router>
</RateLimit>
```

**Implementation Files**:
- `packages/core/src/components/utilities/index.ts` - New utilities export
- `packages/core/src/components/utilities/Guard.tsx`
- `packages/core/src/components/utilities/CORS.tsx`
- `packages/core/src/components/utilities/Transform.tsx`
- `packages/core/src/components/utilities/Static.tsx`
- `packages/core/src/components/utilities/FileUpload.tsx`
- `packages/core/src/components/utilities/RateLimit.tsx`

---

## Phase 3: Advanced Features

### 3.1 Enhanced Path Patterns

**Goal**: Support advanced routing patterns in existing intrinsic elements

```tsx
// Enhanced path matching capabilities
<get path="users/:id(\\d+)" />           // Regex constraints
<get path="files/*filepath" />           // Named wildcards  
<get path="api/v{version:1|2}/users" />  // Enum parameters
<get path="posts/:slug?" />              // Optional parameters
```

**Implementation Files**:
- `packages/core/src/runtime/trie.ts` - Enhance path parsing and matching
- `packages/core/src/runtime/traverse.ts` - Update route processing

### 3.2 Advanced Validation Features

**Goal**: Enhanced validation capabilities

```tsx
// Complete validation example
<post 
  path="users"
  validate={{
    body: userSchema,
    params: z.object({ id: z.coerce.number() }),
    query: z.object({ 
      limit: z.coerce.number().optional(),
      offset: z.coerce.number().optional() 
    }),
    headers: z.object({ 
      'x-api-key': z.string(),
      'content-type': z.literal('application/json')
    }),
    cookies: z.object({
      session: z.string().optional()
    }),
    custom: async (c) => {
      // Custom validation logic
      if (c.headers.get('content-length') > MAX_SIZE) {
        throw new Error('Payload too large');
      }
    }
  }}
  handler={(c) => {
    // All data is now validated and type-safe
    const { limit, offset } = c.query;
    const apiKey = c.headers.get('x-api-key');
    return c.json({ success: true });
  }}
/>
```

---

## Implementation Timeline

### Phase 1: Core MVP (Priority 1) - Weeks 1-3
1. **Week 1**: Enhanced ApiContext implementation
   - Add query, headers, cookies, url, state to ApiContext
   - Implement new response helpers (text, html, redirect, stream, file)
   - Update buildContext function with enhanced parsing

2. **Week 2**: Standard Schema support
   - Implement StandardSchema type definitions
   - Update validation pipeline to support multiple schema formats
   - Maintain backward compatibility with existing Zod usage

3. **Week 3**: Enhanced body parsing and validation
   - Support FormData, ArrayBuffer, multipart parsing
   - Implement complete validation for query, headers, cookies
   - Add custom validation support

### Phase 2: Utility Components (Priority 2) - Weeks 4-6
1. **Week 4**: Core utility components
   - Implement Guard, CORS, Transform components
   - Create utility component architecture and exports

2. **Week 5**: File handling utilities
   - Implement Static file serving component
   - Implement FileUpload component with validation

3. **Week 6**: Advanced utilities
   - Implement RateLimit component
   - Add additional utility components as needed
   - Documentation and examples

### Phase 3: Advanced Features (Priority 3) - Weeks 7+
1. Enhanced path patterns with regex/constraints
2. Additional utility components based on user feedback
3. Performance optimizations
4. OpenAPI integration (long-term goal)

---

## Testing Strategy

### Unit Tests
- Core routing and matching logic
- Validation pipeline with different schema types
- Response helper functions
- Utility component functionality

### Integration Tests
- Full request/response cycles
- Middleware composition and state sharing
- File upload and static serving
- Error handling scenarios

### Performance Tests
- Route matching performance with large route trees
- Memory usage with concurrent requests
- Middleware overhead measurements

---

## Documentation Plan

### Core Documentation
- Enhanced README files for each package
- API reference documentation
- Migration guide for breaking changes

### Examples and Tutorials
- Complete application examples
- Utility component usage examples
- Integration with popular validation libraries
- Deployment guides for different platforms

### Developer Experience
- TypeScript definitions with comprehensive JSDoc
- VS Code snippets for common patterns
- Development tooling recommendations

---

## Success Criteria

### MVP Success Metrics
- ✅ Complete request data access (query, headers, cookies)
- ✅ All common response types supported
- ✅ File upload handling
- ✅ Static file serving
- ✅ Multiple validation library support
- ✅ Rich utility component ecosystem
- ✅ Comprehensive TypeScript support
- ✅ Production-ready performance

### Long-term Goals
- Community adoption and ecosystem growth
- Plugin/extension architecture
- Additional platform adapters (Deno, Bun, Cloudflare Workers)
- Real-time features (WebSockets, SSE)
- Development tooling and debugging support
- OpenAPI integration and documentation generation

---

## Risk Mitigation

### Technical Risks
- **Breaking Changes**: Maintain backward compatibility where possible, provide migration guides
- **Performance**: Regular benchmarking and optimization
- **Ecosystem Integration**: Ensure compatibility with popular tools and libraries

### Adoption Risks  
- **Learning Curve**: Comprehensive documentation and examples
- **Framework Competition**: Focus on unique JSX-based DX and type safety
- **Community Building**: Early adopter program and feedback collection

---

This plan provides a comprehensive roadmap for building Reono into a production-ready framework while maintaining its elegant JSX-based API and strong TypeScript integration.
