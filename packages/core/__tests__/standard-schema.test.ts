import { describe, it, expect, beforeAll } from 'vitest';
import { render, createElement } from 'reono';

// Mock different validation libraries to test standard schema support
const zodLikeSchema = {
  parse: (input: unknown) => {
    if (typeof input === 'object' && input !== null && 'name' in input) {
      return input;
    }
    throw new Error('Invalid input for zod-like schema');
  }
};

const zodLikeQuerySchema = {
  parse: (input: unknown) => {
    if (typeof input === 'object' && input !== null) {
      // Convert string values to appropriate types for query params
      const result: any = {};
      for (const [key, value] of Object.entries(input as Record<string, any>)) {
        if (key === 'id' && typeof value === 'string' && !isNaN(Number(value))) {
          result[key] = Number(value);
        } else {
          result[key] = value;
        }
      }
      return result;
    }
    throw new Error('Invalid input for zod-like query schema');
  }
};

const joiLikeSchema = {
  validate: (input: unknown) => {
    if (typeof input === 'object' && input !== null && 'email' in input) {
      return { error: null, value: input };
    }
    return { error: new Error('Invalid input for joi-like schema'), value: null };
  }
};

const standardSchema = {
  "~standard": {
    version: 1,
    vendor: "test-vendor",
    validate: (input: unknown) => {
      if (typeof input === 'object' && input !== null && 'id' in input) {
        return { success: true, data: input };
      }
      return { 
        success: false, 
        issues: [{ message: 'Invalid input for standard schema' }] 
      };
    }
  }
};

const standardQuerySchema = {
  "~standard": {
    version: 1,
    vendor: "test-vendor",
    validate: (input: unknown) => {
      if (typeof input === 'object' && input !== null) {
        // Convert string values to appropriate types for query params
        const result: any = {};
        for (const [key, value] of Object.entries(input as Record<string, any>)) {
          if (key === 'id' && typeof value === 'string' && !isNaN(Number(value))) {
            result[key] = Number(value);
          } else {
            result[key] = value;
          }
        }
        return { success: true, data: result };
      }
      return { 
        success: false, 
        issues: [{ message: 'Invalid input for standard schema' }] 
      };
    }
  }
};

const safeParseLikeSchema = {
  safeParse: (input: unknown) => {
    if (typeof input === 'object' && input !== null && 'count' in input) {
      return { success: true, data: input };
    }
    return { 
      success: false, 
      error: new Error('Invalid input for safeParse-like schema') 
    };
  }
};

let handle: (req: Request) => Promise<Response>;

beforeAll(() => {
  const tree = createElement(
    'router',
    { path: 'api' },
    
    // Test Zod-like schema (current support)
    createElement('post', {
      path: 'zod-test',
      validate: {
        body: zodLikeSchema,
        query: zodLikeSchema
      },
      handler: (c: any) => c.json({ 
        type: 'zod-like',
        body: c.body,
        query: Object.fromEntries(c.query.entries())
      })
    }),

    // Test standard schema format
    createElement('post', {
      path: 'standard-test',
      validate: {
        body: standardSchema,
        params: standardSchema
      },
      handler: (c: any) => c.json({ 
        type: 'standard',
        body: c.body,
        params: c.params
      })
    }),

    // Test safeParse-like schema
    createElement('post', {
      path: 'safeparse-test/:id',
      validate: {
        body: safeParseLikeSchema,
        headers: safeParseLikeSchema
      },
      handler: (c: any) => c.json({ 
        type: 'safeParse-like',
        body: c.body,
        headers: Object.fromEntries(c.headers.entries())
      })
    }),

    // Test mixed validation formats
    createElement('post', {
      path: 'mixed-test',
      validate: {
        body: zodLikeSchema,           // parse method
        query: standardQuerySchema,   // ~standard format with type coercion
        headers: safeParseLikeSchema  // safeParse method
      },
      handler: (c: any) => c.json({ 
        type: 'mixed',
        body: c.body,
        query: Object.fromEntries(c.query.entries()),
        headers: Object.fromEntries(c.headers.entries())
      })
    }),

    // Test enhanced validation with all context properties
    createElement('post', {
      path: 'enhanced-validation',
      validate: {
        body: zodLikeSchema,
        query: standardQuerySchema,   // Use schema with type coercion
        headers: safeParseLikeSchema,
        cookies: zodLikeSchema,
        custom: async (c: any) => {
          // Custom validation logic
          if (c.headers.get('x-test-header') !== 'valid') {
            throw new Error('Custom validation failed');
          }
        }
      },
      handler: (c: any) => c.json({ 
        type: 'enhanced',
        body: c.body,
        query: Object.fromEntries(c.query.entries()),
        headers: Object.fromEntries(c.headers.entries()),
        cookies: Object.fromEntries(c.cookies.entries())
      })
    }),

    // Test validation error handling
    createElement('post', {
      path: 'validation-errors',
      validate: {
        body: zodLikeSchema // This will fail if body doesn't have 'name'
      },
      handler: (c: any) => c.json({ success: true })
    })
  );
  handle = render(tree as any);
});

function makeRequest(path: string, options: RequestInit = {}) {
  return new Request(`http://localhost${path}`, options);
}

describe('Standard Schema Support', () => {
  it('supports current Zod-like parse method', async () => {
    const res = await handle(makeRequest('/api/zod-test?name=test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'John' })
    }));
    
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      type: 'zod-like',
      body: { name: 'John' },
      query: { name: 'test' }
    });
  });

  it('supports new standard schema format', async () => {
    const res = await handle(makeRequest('/api/standard-test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 123 })
    }));
    
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      type: 'standard',
      body: { id: 123 },
      params: {}
    });
  });

  it('supports safeParse-like method', async () => {
    const res = await handle(makeRequest('/api/safeparse-test/1', {
      method: 'POST',
      headers: { 
        'content-type': 'application/json',
        'count': '5'
      },
      body: JSON.stringify({ count: 10 })
    }));
    
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.type).toBe('safeParse-like');
    expect(data.body).toEqual({ count: 10 });
    expect(data.headers.count).toBe('5');
  });

  it('supports mixed validation formats in one route', async () => {
    const res = await handle(makeRequest('/api/mixed-test?id=456', {
      method: 'POST',
      headers: { 
        'content-type': 'application/json',
        'count': '3'
      },
      body: JSON.stringify({ name: 'Mixed Test' })
    }));
    
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      type: 'mixed',
      body: { name: 'Mixed Test' },
      query: { id: 456 },
      headers: { 'content-type': 'application/json', count: '3' }
    });
  });

  it('supports enhanced validation with all context properties', async () => {
    const res = await handle(makeRequest('/api/enhanced-validation?id=789', {
      method: 'POST',
      headers: { 
        'content-type': 'application/json',
        'x-test-header': 'valid',
        'count': '7',
        'cookie': 'name=session123'
      },
      body: JSON.stringify({ name: 'Enhanced Test' })
    }));
    
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.type).toBe('enhanced');
    expect(data.body).toEqual({ name: 'Enhanced Test' });
    expect(data.query).toEqual({ id: 789 });
    expect(data.cookies).toEqual({ name: 'session123' });
  });

  it('handles validation errors properly', async () => {
    const res = await handle(makeRequest('/api/validation-errors', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ invalid: 'data' }) // Missing 'name' field
    }));
    
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('ValidationError');
    expect(data.message).toContain('Invalid input for zod-like schema');
  });

  it('handles standard schema validation errors', async () => {
    const res = await handle(makeRequest('/api/standard-test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ invalid: 'data' }) // Missing 'id' field
    }));
    
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('ValidationError');
    expect(data.issues).toBeDefined();
  });

  it('handles safeParse validation errors', async () => {
    const res = await handle(makeRequest('/api/safeparse-test/1', {
      method: 'POST',
      headers: { 
        'content-type': 'application/json',
        'invalid': 'header'  // Missing 'count' field
      },
      body: JSON.stringify({ invalid: 'data' }) // Missing 'count' field
    }));
    
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('ValidationError');
  });

  it('handles custom validation failures', async () => {
    const res = await handle(makeRequest('/api/enhanced-validation?id=789', {
      method: 'POST',
      headers: { 
        'content-type': 'application/json',
        'x-test-header': 'invalid', // Will fail custom validation
        'count': '7',
        'cookie': 'name=session123'
      },
      body: JSON.stringify({ name: 'Enhanced Test' })
    }));
    
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('ValidationError');
    expect(data.message).toContain('Custom validation failed');
  });
});
