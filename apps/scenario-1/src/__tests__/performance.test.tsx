import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createApp } from "@reono/node-server";
import { cors } from "../middleware/cors";
import { errorHandler } from "../middleware/error-handler";
import { authGuard, users } from "../middleware/auth";

// Performance test configuration (separate from integration tests)
const PERF_TEST_PORT = 8012;
const PERF_TEST_BASE_URL = `http://localhost:${PERF_TEST_PORT}`;

// Test API keys for authentication
const PERF_TEST_API_KEYS = {
  ADMIN: "admin-key-123",
  USER: "user-key-456",
  PREMIUM: "premium-key-789",
  INVALID: "invalid-key-999",
};

// Simplified routers for performance testing (no rate limiting)
const PerfUserRouter = () => (
  <router path="users">
    <use handler={authGuard}>
      <get
        path=""
        handler={(c) => {
          const user = (c as any).user;
          if (user.role === "admin") {
            return c.json({
              users: users.map((u) => ({
                id: u.id,
                email: u.email,
                name: u.name,
                role: u.role,
                tier: u.tier,
              })),
              total: users.length,
            });
          } else {
            return c.json({
              users: [
                {
                  id: user.id,
                  email: user.email,
                  name: user.name,
                  role: user.role,
                  tier: user.tier,
                },
              ],
              total: 1,
            });
          }
        }}
      />
    </use>
  </router>
);

const PerfContentRouter = () => (
  <router path="content">
    <use handler={authGuard}>
      <get
        path="articles"
        handler={(c) => {
          return c.json({
            articles: [
              {
                id: 1,
                title: "Performance Test Article",
                content: "Test content",
                published: true,
              },
            ],
            total: 1,
          });
        }}
      />
    </use>
  </router>
);

// Performance test application (no rate limiting)
const App = () => (
  <use handler={errorHandler}>
    <use handler={cors}>
      <router path="api/v1">
        <get
          path="health"
          handler={(c) => c.json({ status: "ok", timestamp: Date.now() })}
        />
        <PerfUserRouter />
        <PerfContentRouter />
      </router>
    </use>
  </use>
);

describe("Scenario 1: Performance Tests", () => {
  let app: any;
  let server: any;

  beforeAll(async () => {
    app = createApp();
    app.serve(<App />);

    await new Promise<void>((resolve) => {
      server = app.listen(PERF_TEST_PORT, () => {
        console.log(
          `🚀 Performance test server started on port ${PERF_TEST_PORT}`
        );
        resolve();
      });
    });
  }, 15000); // Increased timeout to 15 seconds

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => {
          console.log("🛑 Performance test server stopped");
          resolve();
        });
      });
    }
  });

  describe("Response Time", () => {
    it("should respond to health check quickly", async () => {
      const start = performance.now();

      const response = await fetch(`${PERF_TEST_BASE_URL}/api/v1/health`);
      const data = await response.json();

      const duration = performance.now() - start;

      expect(response.status).toBe(200);
      expect(data.status).toBe("ok");
      expect(duration).toBeLessThan(100); // Should respond in under 100ms
    });

    it("should handle authenticated requests efficiently", async () => {
      const start = performance.now();

      const response = await fetch(`${PERF_TEST_BASE_URL}/api/v1/users`, {
        headers: {
          Authorization: `Bearer ${PERF_TEST_API_KEYS.USER}`,
        },
      });

      const duration = performance.now() - start;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(200); // Should be fast without rate limiting
    });
  });

  describe("Concurrent Requests", () => {
    it("should handle multiple concurrent health checks", async () => {
      const promises = Array.from({ length: 10 }, () =>
        fetch(`${PERF_TEST_BASE_URL}/api/v1/health`)
      );

      const start = performance.now();
      const responses = await Promise.all(promises);
      const duration = performance.now() - start;

      expect(responses).toHaveLength(10);
      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });

      expect(duration).toBeLessThan(500); // All 10 requests in under 500ms
    });

    it("should handle concurrent authenticated requests", async () => {
      const promises = Array.from({ length: 5 }, () =>
        fetch(`${PERF_TEST_BASE_URL}/api/v1/users`, {
          headers: {
            Authorization: `Bearer ${PERF_TEST_API_KEYS.USER}`,
          },
        })
      );

      const start = performance.now();
      const responses = await Promise.all(promises);
      const duration = performance.now() - start;

      expect(responses).toHaveLength(5);
      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });

      console.log(
        `✅ 5 concurrent authenticated requests completed in ${duration.toFixed(2)}ms`
      );
    });
  });

  describe("Memory Usage", () => {
    it("should not leak memory with repeated requests", async () => {
      const initialMemory = process.memoryUsage();

      // Make 50 requests (reduced for performance)
      for (let i = 0; i < 50; i++) {
        const response = await fetch(`${PERF_TEST_BASE_URL}/api/v1/health`);
        await response.json();
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;

      console.log(
        `📊 Memory growth after 50 requests: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`
      );

      // Memory growth should be reasonable (less than 25MB for 50 requests)
      expect(memoryGrowth).toBeLessThan(25 * 1024 * 1024);
    });
  });
});
