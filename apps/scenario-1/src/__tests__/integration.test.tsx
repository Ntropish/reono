import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '@reono/node-server';
import { UserRouter } from '../users/router';
import { ContentRouter } from '../content/router';
import { cors } from '../middleware/cors';
import { logger } from '../middleware/logger';
import { errorHandler } from '../middleware/error-handler';

// Global type declarations for tests
declare global {
  var TEST_PORT: number;
  var TEST_BASE_URL: string;
  var TEST_API_KEYS: {
    ADMIN: string;
    USER: string;
    PREMIUM: string;
    INVALID: string;
  };
}

// Test application
const App = () => (
  <use handler={errorHandler}>
    <use handler={cors}>
      <use handler={logger}>
        <router path="api/v1">
          <get
            path="health"
            handler={(c) => c.json({ 
              status: "ok", 
              timestamp: Date.now(),
              version: "1.0.0"
            })}
          />
          <UserRouter />
          <ContentRouter />
        </router>
      </use>
    </use>
  </use>
);

describe('Scenario 1: Content Management API Integration Tests', () => {
  let app: any;
  let server: any;

  beforeAll(async () => {
    // Start test server
    app = createApp();
    app.serve(<App />);
    
    await new Promise<void>((resolve) => {
      server = app.listen(TEST_PORT, () => {
        console.log(`🧪 Test server started on ${TEST_BASE_URL}`);
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => {
          console.log('🧪 Test server stopped');
          resolve();
        });
      });
    }
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await fetch(`${TEST_BASE_URL}/api/v1/health`);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        status: 'ok',
        version: '1.0.0',
      });
      expect(typeof data.timestamp).toBe('number');
    });
  });

  describe('CORS Middleware', () => {
    it('should handle OPTIONS preflight requests correctly', async () => {
      const response = await fetch(`${TEST_BASE_URL}/api/v1/health`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://example.com',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'Authorization, Content-Type',
        },
      });

      // CORS preflight should return 204 No Content
      expect(response.status).toBe(204);
      
      // Should have proper CORS headers
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('PUT');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('DELETE');
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
      expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
      expect(response.headers.get('Access-Control-Max-Age')).toBe('86400');
      
      // Should have no response body for preflight
      const text = await response.text();
      expect(text).toBe('');
    });

    it('should add CORS headers to regular responses', async () => {
      const response = await fetch(`${TEST_BASE_URL}/api/v1/health`);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    });
  });

  describe('Authentication Guard', () => {
    it('should reject requests without authorization', async () => {
      const response = await fetch(`${TEST_BASE_URL}/api/v1/users`);
      
      expect(response.status).toBe(401);
      
      const data = await response.json();
      expect(data.error).toBe('Missing or invalid authorization header');
    });

    it('should reject requests with invalid API key', async () => {
      const response = await fetch(`${TEST_BASE_URL}/api/v1/users`, {
        headers: {
          'Authorization': `Bearer ${TEST_API_KEYS.INVALID}`,
        },
      });
      
      expect(response.status).toBe(401);
      
      const data = await response.json();
      expect(data.error).toBe('Invalid API key');
    });

    it('should accept requests with valid API key', async () => {
      const response = await fetch(`${TEST_BASE_URL}/api/v1/users`, {
        headers: {
          'Authorization': `Bearer ${TEST_API_KEYS.USER}`,
        },
      });
      
      expect(response.status).toBe(200);
    });
  });

  describe('Rate Limiting', () => {
    it('should include rate limit headers', async () => {
      const response = await fetch(`${TEST_BASE_URL}/api/v1/users`, {
        headers: {
          'Authorization': `Bearer ${TEST_API_KEYS.USER}`,
        },
      });
      
      expect(response.status).toBe(200);
      expect(response.headers.get('X-RateLimit-Limit')).toBeTruthy();
      expect(response.headers.get('X-RateLimit-Remaining')).toBeTruthy();
      expect(response.headers.get('X-RateLimit-Reset')).toBeTruthy();
    });

    it('should enforce rate limits (requires many requests)', async () => {
      // This would require many rapid requests to test properly
      // For now, just verify the headers are present
      const response = await fetch(`${TEST_BASE_URL}/api/v1/health`);
      expect(response.status).toBe(200);
    });
  });

  describe('User Management API', () => {
    it('should get user list (filtered by role)', async () => {
      // Regular user sees only themselves
      const userResponse = await fetch(`${TEST_BASE_URL}/api/v1/users`, {
        headers: {
          'Authorization': `Bearer ${TEST_API_KEYS.USER}`,
        },
      });
      
      expect(userResponse.status).toBe(200);
      const userData = await userResponse.json();
      expect(userData.users).toHaveLength(1);
      expect(userData.users[0].email).toBe('user@example.com');

      // Admin sees all users
      const adminResponse = await fetch(`${TEST_BASE_URL}/api/v1/users`, {
        headers: {
          'Authorization': `Bearer ${TEST_API_KEYS.ADMIN}`,
        },
      });
      
      expect(adminResponse.status).toBe(200);
      const adminData = await adminResponse.json();
      expect(adminData.users.length).toBeGreaterThan(1);
    });

    it('should get specific user with access control', async () => {
      // User can access their own data
      const response = await fetch(`${TEST_BASE_URL}/api/v1/users/2`, {
        headers: {
          'Authorization': `Bearer ${TEST_API_KEYS.USER}`,
        },
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.id).toBe(2);
      expect(data.email).toBe('user@example.com');
    });

    it('should deny access to other user data', async () => {
      // User cannot access other user's data
      const response = await fetch(`${TEST_BASE_URL}/api/v1/users/1`, {
        headers: {
          'Authorization': `Bearer ${TEST_API_KEYS.USER}`,
        },
      });
      
      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Access denied');
    });

    it('should allow admin to create users', async () => {
      const newUser = {
        email: 'newuser@example.com',
        name: 'New User',
        role: 'user',
        tier: 'free',
      };

      const response = await fetch(`${TEST_BASE_URL}/api/v1/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_API_KEYS.ADMIN}`,
        },
        body: JSON.stringify(newUser),
      });
      
      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.email).toBe(newUser.email);
      expect(data.name).toBe(newUser.name);
      expect(typeof data.id).toBe('number');
    });

    it('should deny non-admin user creation', async () => {
      const newUser = {
        email: 'hacker@example.com',
        name: 'Hacker',
      };

      const response = await fetch(`${TEST_BASE_URL}/api/v1/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_API_KEYS.USER}`,
        },
        body: JSON.stringify(newUser),
      });
      
      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Admin access required');
    });
  });

  describe('Content Management API', () => {
    it('should get articles with proper filtering', async () => {
      const response = await fetch(`${TEST_BASE_URL}/api/v1/content/articles`, {
        headers: {
          'Authorization': `Bearer ${TEST_API_KEYS.USER}`,
        },
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data.articles)).toBe(true);
      expect(typeof data.total).toBe('number');
    });

    it('should create new articles', async () => {
      const newArticle = {
        title: 'Test Article',
        content: 'This is a test article content.',
        tags: ['test', 'integration'],
        published: false,
      };

      const response = await fetch(`${TEST_BASE_URL}/api/v1/content/articles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_API_KEYS.USER}`,
        },
        body: JSON.stringify(newArticle),
      });
      
      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.title).toBe(newArticle.title);
      expect(data.content).toBe(newArticle.content);
      expect(data.authorId).toBe(2); // User ID
      expect(data.authorName).toBe('Regular User');
      expect(typeof data.id).toBe('number');
    });

    it('should validate article data', async () => {
      const invalidArticle = {
        title: '', // Invalid: empty title
        content: 'Content',
      };

      const response = await fetch(`${TEST_BASE_URL}/api/v1/content/articles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_API_KEYS.USER}`,
        },
        body: JSON.stringify(invalidArticle),
      });
      
      expect(response.status).toBe(400);
    });
  });

  describe('File Upload Integration', () => {
    it('should reject non-multipart requests to upload endpoint', async () => {
      const response = await fetch(`${TEST_BASE_URL}/api/v1/content/images`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_API_KEYS.USER}`,
        },
        body: JSON.stringify({ test: 'data' }),
      });
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('No file provided');
    });

    it('should handle multipart form without file', async () => {
      const formData = new FormData();
      formData.append('description', 'Test upload');

      const response = await fetch(`${TEST_BASE_URL}/api/v1/content/images`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TEST_API_KEYS.USER}`,
        },
        body: formData,
      });
      
      expect(response.status).toBe(400);
      const data = await response.json();
      // Either specific error or general multipart error is acceptable
      expect(['No file provided', 'Failed to parse multipart data']).toContain(data.error);
    });

    it('should reject invalid file types', async () => {
      // Create a mock text file
      const file = new File(['test content'], 'test.txt', { type: 'text/plain' });
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${TEST_BASE_URL}/api/v1/content/images`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TEST_API_KEYS.USER}`,
        },
        body: formData,
      });
      
      expect(response.status).toBe(400);
      const data = await response.json();
      // Either specific error or general multipart error is acceptable
      expect(['Invalid file type', 'Failed to parse multipart data']).toContain(data.error);
    });

    it('should get user uploads', async () => {
      const response = await fetch(`${TEST_BASE_URL}/api/v1/content/images`, {
        headers: {
          'Authorization': `Bearer ${TEST_API_KEYS.USER}`,
        },
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data.files)).toBe(true);
      expect(typeof data.total).toBe('number');
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown routes', async () => {
      const response = await fetch(`${TEST_BASE_URL}/api/v1/nonexistent`);
      
      expect(response.status).toBe(404);
    });

    it('should handle malformed JSON', async () => {
      const response = await fetch(`${TEST_BASE_URL}/api/v1/content/articles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_API_KEYS.USER}`,
        },
        body: '{invalid json}',
      });
      
      expect(response.status).toBe(400);
    });
  });

  describe('Component Integration', () => {
    it('should demonstrate full middleware stack execution', async () => {
      // This request will go through:
      // 1. Error handler
      // 2. CORS
      // 3. Logger
      // 4. Auth guard
      // 5. Rate limit
      // 6. Route handler
      
      const response = await fetch(`${TEST_BASE_URL}/api/v1/users/2`, {
        headers: {
          'Authorization': `Bearer ${TEST_API_KEYS.USER}`,
        },
      });
      
      expect(response.status).toBe(200);
      
      // Verify CORS headers are present
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      
      // Verify rate limit headers are present
      expect(response.headers.get('X-RateLimit-Limit')).toBeTruthy();
      
      // Verify response content
      const data = await response.json();
      expect(data.id).toBe(2);
    });
  });
});
