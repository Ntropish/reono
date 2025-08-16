import { describe, it, expect, beforeAll } from 'vitest';
import { render, createElement } from 'reono';

// Simulate real validation libraries
const mockZod = {
  object: (shape: any) => ({
    parse: (input: unknown) => {
      if (typeof input === 'object' && input !== null) {
        for (const [key, validator] of Object.entries(shape)) {
          if (!(key in input)) {
            throw new Error(`Missing required field: ${key}`);
          }
          if (typeof validator === 'function') {
            (validator as any)((input as any)[key]);
          }
        }
        return input;
      }
      throw new Error('Expected object');
    }
  }),
  string: () => (value: unknown) => {
    if (typeof value !== 'string') throw new Error('Expected string');
    return value;
  },
  number: () => (value: unknown) => {
    const num = Number(value);
    if (isNaN(num)) throw new Error('Expected number');
    return num;
  },
  coerce: {
    number: () => (value: unknown) => {
      const num = Number(value);
      if (isNaN(num)) throw new Error('Expected coercible number');
      return num;
    }
  }
};

const mockJoi = {
  object: (shape: any) => ({
    validate: (input: unknown) => {
      try {
        if (typeof input !== 'object' || input === null) {
          return { error: new Error('Expected object'), value: null };
        }
        
        for (const key of Object.keys(shape)) {
          if (!(key in input)) {
            return { error: new Error(`Missing required field: ${key}`), value: null };
          }
        }
        
        return { error: null, value: input };
      } catch (error) {
        return { error, value: null };
      }
    }
  }),
  string: () => ({ required: () => ({}) }),
  number: () => ({ required: () => ({}) })
};

// Standard schema implementation
const createStandardSchema = (validator: (input: any) => boolean, errorMessage: string) => ({
  "~standard": {
    version: 1,
    vendor: "test-standard",
    validate: (input: unknown) => {
      if (validator(input)) {
        return { success: true, data: input };
      }
      return { 
        success: false, 
        issues: [{ message: errorMessage, path: [] }] 
      };
    }
  }
});

let handle: (req: Request) => Promise<Response>;

beforeAll(() => {
  const userSchema = mockZod.object({
    name: mockZod.string(),
    email: mockZod.string()
  });

  const paramsSchema = mockZod.object({
    id: mockZod.coerce.number()
  });

  const querySchema = createStandardSchema(
    (input: any) => typeof input === 'object' && 'limit' in input,
    'Query must have limit field'
  );

  const headersSchema = {
    safeParse: (input: unknown) => {
      if (typeof input === 'object' && input !== null && 'x-api-key' in input) {
        return { success: true, data: input };
      }
      return {
        success: false,
        error: new Error('Missing x-api-key header')
      };
    }
  };

  const tree = createElement(
    'router',
    { path: 'api' },
    
    // Real-world example with multiple schema types
    createElement('post', {
      path: 'users/:id',
      validate: {
        body: userSchema,                    // Zod-like (parse)
        params: paramsSchema,                // Zod-like (parse) 
        query: querySchema,                  // Standard schema
        headers: headersSchema,              // safeParse-like
        custom: async (c: any) => {
          const contentLength = c.headers.get('content-length');
          if (contentLength && parseInt(contentLength) > 1000) {
            throw new Error('Request too large');
          }
        }
      },
      handler: (c: any) => c.json({
        user: c.body,
        userId: c.params.id,
        limit: Object.fromEntries(c.query.entries()).limit,
        apiKey: c.headers.get('x-api-key')
      })
    }),

    // Test backward compatibility
    createElement('post', {
      path: 'legacy',
      validate: {
        body: userSchema  // Only body validation like before
      },
      handler: (c: any) => c.json({ legacy: true, user: c.body })
    }),

    // Test no validation (should work as before)
    createElement('get', {
      path: 'no-validation',
      handler: (c: any) => c.json({ noValidation: true })
    }),

    // Test cookies validation
    createElement('get', {
      path: 'cookies-test',
      validate: {
        cookies: createStandardSchema(
          (input: any) => typeof input === 'object' && 'session' in input,
          'Missing session cookie'
        )
      },
      handler: (c: any) => c.json({
        session: Object.fromEntries(c.cookies.entries()).session
      })
    })
  );
  handle = render(tree as any);
});

function makeRequest(path: string, options: RequestInit = {}) {
  return new Request(`http://localhost${path}`, options);
}

describe('Standard Schema Integration', () => {
  it('handles complex multi-schema validation successfully', async () => {
    const res = await handle(makeRequest('/api/users/123?limit=10', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'secret123',
        'content-length': '50'
      },
      body: JSON.stringify({
        name: 'John Doe',
        email: 'john@example.com'
      })
    }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      user: { name: 'John Doe', email: 'john@example.com' },
      userId: 123,
      limit: '10',
      apiKey: 'secret123'
    });
  });

  it('maintains backward compatibility with existing validation', async () => {
    const res = await handle(makeRequest('/api/legacy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Legacy User',
        email: 'legacy@example.com'
      })
    }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      legacy: true,
      user: { name: 'Legacy User', email: 'legacy@example.com' }
    });
  });

  it('works without any validation', async () => {
    const res = await handle(makeRequest('/api/no-validation'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ noValidation: true });
  });

  it('validates cookies using standard schema', async () => {
    const res = await handle(makeRequest('/api/cookies-test', {
      headers: { cookie: 'session=abc123; theme=dark' }
    }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ session: 'abc123' });
  });

  it('handles body validation failures (Zod-like)', async () => {
    const res = await handle(makeRequest('/api/users/123?limit=10', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'secret123'
      },
      body: JSON.stringify({ name: 'John' }) // Missing email
    }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('ValidationError');
    expect(data.message).toContain('Missing required field: email');
  });

  it('handles query validation failures (Standard schema)', async () => {
    const res = await handle(makeRequest('/api/users/123?invalid=true', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'secret123'
      },
      body: JSON.stringify({
        name: 'John Doe',
        email: 'john@example.com'
      })
    }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('ValidationError');
    expect(data.issues).toBeDefined();
    expect(data.issues[0].message).toContain('Query must have limit field');
  });

  it('handles header validation failures (safeParse-like)', async () => {
    const res = await handle(makeRequest('/api/users/123?limit=10', {
      method: 'POST',
      headers: { 'content-type': 'application/json' }, // Missing x-api-key
      body: JSON.stringify({
        name: 'John Doe',
        email: 'john@example.com'
      })
    }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('ValidationError');
    expect(data.message).toContain('Missing x-api-key header');
  });

  it('handles custom validation failures', async () => {
    const largeBody = JSON.stringify({
      name: 'John Doe',
      email: 'john@example.com',
      extraData: 'x'.repeat(1000) // Make content-length > 1000
    });

    const res = await handle(makeRequest('/api/users/123?limit=10', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'secret123',
        'content-length': largeBody.length.toString()
      },
      body: largeBody
    }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('ValidationError');
    expect(data.message).toContain('Request too large');
  });

  it('handles missing cookies validation', async () => {
    const res = await handle(makeRequest('/api/cookies-test')); // No cookies

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('ValidationError');
    expect(data.issues[0].message).toContain('Missing session cookie');
  });
});
