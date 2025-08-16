import { describe, it, expect, beforeAll } from 'vitest';
import { render, createElement } from 'reono';

let handle: (req: Request) => Promise<Response>;

beforeAll(() => {
  const tree = createElement(
    'router',
    { path: 'api' },
    // Test query parameter access
    createElement('get', {
      path: 'search',
      handler: (c: any) => c.json({
        query: Object.fromEntries(c.query.entries()),
        total: c.query.get('limit') || '10'
      })
    }),
    // Test header access
    createElement('get', {
      path: 'headers',
      handler: (c: any) => c.json({
        apiKey: c.headers.get('x-api-key'),
        userAgent: c.headers.get('user-agent')
      })
    }),
    // Test cookie access
    createElement('get', {
      path: 'profile',
      handler: (c: any) => {
        const sessionId = c.cookies.get('session');
        if (!sessionId) {
          return c.json({ error: 'No session' }, 401);
        }
        return c.json({ sessionId, authenticated: true });
      }
    }),
    // Test new response helpers
    createElement('get', {
      path: 'text',
      handler: (c: any) => c.text('Plain text response', 200)
    }),
    createElement('get', {
      path: 'html',
      handler: (c: any) => c.html('<h1>HTML Response</h1>')
    }),
    createElement('get', {
      path: 'redirect',
      handler: (c: any) => c.redirect('/new-location', 302)
    }),
    createElement('get', {
      path: 'file',
      handler: (c: any) => {
        const data = new TextEncoder().encode('File content');
        return c.file(data, 'download.txt');
      }
    }),
    // Test enhanced body parsing
    createElement('post', {
      path: 'upload',
      handler: (c: any) => {
        if (c.body instanceof FormData) {
          const files = [];
          for (const [key, value] of c.body.entries()) {
            if (value instanceof File) {
              files.push({ key, name: value.name, size: value.size });
            } else {
              files.push({ key, value: value.toString() });
            }
          }
          return c.json({ type: 'FormData', files });
        } else if (c.body instanceof ArrayBuffer) {
          return c.json({ type: 'ArrayBuffer', size: c.body.byteLength });
        } else {
          return c.json({ type: 'other', body: c.body });
        }
      }
    }),
    // Test state sharing between middleware
    createElement('use', {
      handler: async (c: any, next: any) => {
        c.state.set('middleware-data', 'shared-value');
        c.state.set('request-id', Math.random().toString(36));
        return next();
      }
    }, 
      createElement('get', {
        path: 'state',
        handler: (c: any) => c.json({
          shared: c.state.get('middleware-data'),
          requestId: c.state.get('request-id'),
          hasState: c.state.has('middleware-data')
        })
      })
    ),
    // Test URL access
    createElement('get', {
      path: 'url-info',
      handler: (c: any) => c.json({
        pathname: c.url.pathname,
        search: c.url.search,
        host: c.url.host,
        protocol: c.url.protocol
      })
    }),
    // Test stream response
    createElement('get', {
      path: 'stream',
      handler: (c: any) => {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('chunk1\n'));
            controller.enqueue(new TextEncoder().encode('chunk2\n'));
            controller.close();
          }
        });
        return c.stream(stream, { 
          headers: { 'content-type': 'text/plain' } 
        });
      }
    }),
    // Test complex scenario combining multiple features
    createElement('post', {
      path: 'complex',
      handler: (c: any) => {
        const sessionId = c.cookies.get('session');
        const contentType = c.headers.get('content-type');
        const format = c.query.get('format') || 'json';
        
        if (!sessionId) {
          return c.text('Unauthorized', 401);
        }
        
        const data = {
          session: sessionId,
          contentType,
          body: c.body,
          timestamp: Date.now()
        };
        
        if (format === 'html') {
          return c.html(`<div>Session: ${sessionId}</div>`);
        } else if (format === 'text') {
          return c.text(`Session: ${sessionId}`, 200);
        } else {
          return c.json(data);
        }
      }
    })
  );
  handle = render(tree as any);
});

function makeRequest(path: string, options: RequestInit = {}) {
  return new Request(`http://localhost${path}`, options);
}

describe('Enhanced ApiContext Integration', () => {
  it('provides access to query parameters', async () => {
    const res = await handle(makeRequest('/api/search?q=test&limit=50'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      query: { q: 'test', limit: '50' },
      total: '50'
    });
  });

  it('handles empty query parameters', async () => {
    const res = await handle(makeRequest('/api/search'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      query: {},
      total: '10'
    });
  });

  it('provides access to request headers', async () => {
    const res = await handle(makeRequest('/api/headers', {
      headers: {
        'x-api-key': 'secret123',
        'user-agent': 'test-client/1.0'
      }
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      apiKey: 'secret123',
      userAgent: 'test-client/1.0'
    });
  });

  it('parses and provides access to cookies', async () => {
    const res = await handle(makeRequest('/api/profile', {
      headers: { cookie: 'session=abc123; theme=dark' }
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      sessionId: 'abc123',
      authenticated: true
    });
  });

  it('handles missing cookies gracefully', async () => {
    const res = await handle(makeRequest('/api/profile'));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data).toEqual({ error: 'No session' });
  });

  it('text helper works correctly', async () => {
    const res = await handle(makeRequest('/api/text'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await res.text()).toBe('Plain text response');
  });

  it('html helper works correctly', async () => {
    const res = await handle(makeRequest('/api/html'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await res.text()).toBe('<h1>HTML Response</h1>');
  });

  it('redirect helper works correctly', async () => {
    const res = await handle(makeRequest('/api/redirect'));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/new-location');
  });

  it('file helper works correctly', async () => {
    const res = await handle(makeRequest('/api/file'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="download.txt"');
    expect(res.headers.get('content-type')).toBe('text/plain');
    expect(await res.text()).toBe('File content');
  });

  it('state sharing works between middleware and handlers', async () => {
    const res = await handle(makeRequest('/api/state'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.shared).toBe('shared-value');
    expect(typeof data.requestId).toBe('string');
    expect(data.hasState).toBe(true);
  });

  it('provides URL object access', async () => {
    const res = await handle(makeRequest('/api/url-info?test=value'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.pathname).toBe('/api/url-info');
    expect(data.search).toBe('?test=value');
    expect(data.host).toBe('localhost');
    expect(data.protocol).toBe('http:');
  });

  it('stream helper works correctly', async () => {
    const res = await handle(makeRequest('/api/stream'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain');
    
    const text = await res.text();
    expect(text).toBe('chunk1\nchunk2\n');
  });

  it('handles FormData uploads', async () => {
    const formData = new FormData();
    formData.append('text', 'hello world');
    formData.append('number', '42');
    
    const res = await handle(makeRequest('/api/upload', {
      method: 'POST',
      body: formData
    }));
    
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.type).toBe('FormData');
    expect(data.files).toEqual([
      { key: 'text', value: 'hello world' },
      { key: 'number', value: '42' }
    ]);
  });

  it('handles ArrayBuffer uploads', async () => {
    const buffer = new ArrayBuffer(10);
    const view = new Uint8Array(buffer);
    view.fill(42);
    
    const res = await handle(makeRequest('/api/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: buffer
    }));
    
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.type).toBe('ArrayBuffer');
    expect(data.size).toBe(10);
  });

  it('complex scenario with multiple enhanced features', async () => {
    const res = await handle(makeRequest('/api/complex?format=json', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cookie': 'session=user123'
      },
      body: JSON.stringify({ message: 'test data' })
    }));
    
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.session).toBe('user123');
    expect(data.contentType).toBe('application/json');
    expect(data.body).toEqual({ message: 'test data' });
    expect(typeof data.timestamp).toBe('number');
  });

  it('complex scenario with HTML format', async () => {
    const res = await handle(makeRequest('/api/complex?format=html', {
      method: 'POST',
      headers: {
        'content-type': 'text/plain',
        'cookie': 'session=user456'
      },
      body: 'plain text body'
    }));
    
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await res.text()).toBe('<div>Session: user456</div>');
  });

  it('complex scenario with text format', async () => {
    const res = await handle(makeRequest('/api/complex?format=text', {
      method: 'POST',
      headers: {
        'cookie': 'session=user789'
      }
    }));
    
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await res.text()).toBe('Session: user789');
  });

  it('complex scenario without session returns 401', async () => {
    const res = await handle(makeRequest('/api/complex', {
      method: 'POST',
      body: JSON.stringify({ test: 'data' })
    }));
    
    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await res.text()).toBe('Unauthorized');
  });
});
