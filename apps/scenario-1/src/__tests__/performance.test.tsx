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

// Test application (simplified for performance testing)
const App = () => (
  <use handler={errorHandler}>
    <use handler={cors}>
      <router path="api/v1">
        <get
          path="health"
          handler={(c) => c.json({ status: "ok", timestamp: Date.now() })}
        />
        <UserRouter />
        <ContentRouter />
      </router>
    </use>
  </use>
);

describe('Scenario 1: Performance Tests', () => {
  let app: any;
  let server: any;

  beforeAll(async () => {
    app = createApp();
    app.serve(<App />);
    
    await new Promise<void>((resolve) => {
      server = app.listen(8082, () => {
        console.log('🚀 Performance test server started on port 8082');
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => {
          console.log('🛑 Performance test server stopped');
          resolve();
        });
      });
    }
  });

  describe('Response Time', () => {
    it('should respond to health check quickly', async () => {
      const start = performance.now();
      
      const response = await fetch('http://localhost:8082/api/v1/health');
      const data = await response.json();
      
      const duration = performance.now() - start;
      
      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(duration).toBeLessThan(100); // Should respond in under 100ms
    });

    it('should handle authenticated requests efficiently', async () => {
      const start = performance.now();
      
      const response = await fetch('http://localhost:8082/api/v1/users', {
        headers: {
          'Authorization': `Bearer ${TEST_API_KEYS.USER}`,
        },
      });
      
      const duration = performance.now() - start;
      
      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(200); // Auth + rate limiting + response
    });
  });

  describe('Concurrent Requests', () => {
    it('should handle multiple concurrent health checks', async () => {
      const promises = Array.from({ length: 10 }, () =>
        fetch('http://localhost:8082/api/v1/health')
      );
      
      const start = performance.now();
      const responses = await Promise.all(promises);
      const duration = performance.now() - start;
      
      expect(responses).toHaveLength(10);
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
      
      expect(duration).toBeLessThan(500); // All 10 requests in under 500ms
    });

    it('should handle concurrent authenticated requests', async () => {
      const promises = Array.from({ length: 5 }, () =>
        fetch('http://localhost:8082/api/v1/users', {
          headers: {
            'Authorization': `Bearer ${TEST_API_KEYS.USER}`,
          },
        })
      );
      
      const start = performance.now();
      const responses = await Promise.all(promises);
      const duration = performance.now() - start;
      
      expect(responses).toHaveLength(5);
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
      
      console.log(`✅ 5 concurrent authenticated requests completed in ${duration.toFixed(2)}ms`);
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory with repeated requests', async () => {
      const initialMemory = process.memoryUsage();
      
      // Make 100 requests
      for (let i = 0; i < 100; i++) {
        const response = await fetch('http://localhost:8082/api/v1/health');
        await response.json();
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage();
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      
      console.log(`📊 Memory growth after 100 requests: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`);
      
      // Memory growth should be reasonable (less than 50MB for 100 requests)
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024);
    });
  });
});
