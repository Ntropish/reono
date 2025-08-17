import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createApp } from "@reono/node-server";
import { TenantRouter } from "../tenants/router";
import { UserRouter } from "../users/router";
import { AnalyticsRouter } from "../analytics/router";
import { BillingRouter } from "../billing/router";
import { ContentRouter } from "../content/router";
import { basicCors as cors } from "../middleware/cors";
import { logger } from "../middleware/logger";
import { errorHandler } from "../middleware/error-handler";
import { globalRateLimit } from "../middleware/rate-limit";
import { createTEST_BASE_URL, TEST_API_KEYS, TEST_TENANTS } from "./util";

// Test application (simplified for performance testing)
const App = () => (
  <use handler={errorHandler}>
    <use handler={cors}>
      <use handler={globalRateLimit}>
        <get
          path="health"
          handler={(c) =>
            c.json({
              status: "ok",
              timestamp: Date.now(),
              service: "Multi-Tenant SaaS API Gateway",
            })
          }
        />
        <router path="api/v1">
          <TenantRouter />
          <UserRouter />
          <AnalyticsRouter />
          <BillingRouter />
          <ContentRouter />
        </router>
      </use>
    </use>
  </use>
);

describe("Scenario 2: Multi-Tenant SaaS API Gateway Performance Tests", () => {
  let app: any;
  let server: any;
  const PERF_TEST_PORT = 8022;
  const PERF_BASE_URL = createTEST_BASE_URL(PERF_TEST_PORT);

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
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => {
          console.log("🚀 Performance test server stopped");
          resolve();
        });
      });
    }
  });

  describe("Health Check Performance", () => {
    it("should handle health checks with low latency", async () => {
      const startTime = Date.now();
      const response = await fetch(`${PERF_BASE_URL}/health`);
      const endTime = Date.now();

      expect(response.status).toBe(200);
      expect(endTime - startTime).toBeLessThan(100); // Should respond within 100ms
    });

    it("should handle concurrent health checks", async () => {
      const concurrentRequests = 10;
      const startTime = Date.now();

      const requests = Array.from({ length: concurrentRequests }, () =>
        fetch(`${PERF_BASE_URL}/health`)
      );

      const responses = await Promise.all(requests);
      const endTime = Date.now();

      // All requests should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });

      // Total time for 10 concurrent requests should be reasonable
      expect(endTime - startTime).toBeLessThan(500);
    });
  });

  describe("Authentication Performance", () => {
    it("should handle auth validation efficiently", async () => {
      const validKey = TEST_API_KEYS.PREMIUM;
      const tenantId = TEST_TENANTS.PREMIUM;

      const startTime = Date.now();
      const response = await fetch(
        `${PERF_BASE_URL}/api/v1/tenant/${tenantId}/users`,
        {
          headers: {
            Authorization: `Bearer ${validKey}`,
          },
        }
      );
      const endTime = Date.now();

      expect(response.status).toBe(200);
      expect(endTime - startTime).toBeLessThan(200); // Auth should be fast
    });

    it("should handle invalid auth efficiently", async () => {
      const invalidKey = TEST_API_KEYS.INVALID;
      const tenantId = TEST_TENANTS.PREMIUM;

      const startTime = Date.now();
      const response = await fetch(
        `${PERF_BASE_URL}/api/v1/tenant/${tenantId}/users`,
        {
          headers: {
            Authorization: `Bearer ${invalidKey}`,
          },
        }
      );
      const endTime = Date.now();

      expect(response.status).toBe(401);
      expect(endTime - startTime).toBeLessThan(150); // Fast rejection
    });
  });

  describe("Tenant Isolation Performance", () => {
    it("should handle multi-tenant requests efficiently", async () => {
      const tenantTests = [
        { key: TEST_API_KEYS.PREMIUM, tenant: TEST_TENANTS.PREMIUM },
        { key: TEST_API_KEYS.ENTERPRISE, tenant: TEST_TENANTS.ENTERPRISE },
      ];

      const startTime = Date.now();

      const requests = tenantTests.map(({ key, tenant }) =>
        fetch(`${PERF_BASE_URL}/api/v1/tenant/${tenant}/users`, {
          headers: {
            Authorization: `Bearer ${key}`,
          },
        })
      );

      const responses = await Promise.all(requests);
      const endTime = Date.now();

      // All tenant requests should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });

      expect(endTime - startTime).toBeLessThan(400); // Multi-tenant should be efficient
    });
  });

  describe("Rate Limiting Performance", () => {
    it("should apply rate limits without significant overhead", async () => {
      const validKey = TEST_API_KEYS.PREMIUM;
      const tenantId = TEST_TENANTS.PREMIUM;

      // Make several requests to test rate limiting performance
      const numRequests = 5;
      const startTime = Date.now();

      const requests = Array.from({ length: numRequests }, () =>
        fetch(`${PERF_BASE_URL}/api/v1/tenant/${tenantId}/users`, {
          headers: {
            Authorization: `Bearer ${validKey}`,
          },
        })
      );

      const responses = await Promise.all(requests);
      const endTime = Date.now();

      // Some requests should succeed (rate limiting may kick in)
      const successfulRequests = responses.filter((r) => r.status === 200);
      expect(successfulRequests.length).toBeGreaterThan(0);

      // Average time per request should be reasonable
      const avgTime = (endTime - startTime) / numRequests;
      expect(avgTime).toBeLessThan(200);
    });
  });

  describe("Analytics API Performance", () => {
    it("should handle analytics requests efficiently for premium users", async () => {
      const validKey = TEST_API_KEYS.PREMIUM;
      const tenantId = TEST_TENANTS.PREMIUM;

      const startTime = Date.now();
      const response = await fetch(
        `${PERF_BASE_URL}/api/v1/tenant/${tenantId}/analytics`,
        {
          headers: {
            Authorization: `Bearer ${validKey}`,
          },
        }
      );
      const endTime = Date.now();

      expect(response.status).toBe(200);
      expect(endTime - startTime).toBeLessThan(300); // Analytics should be reasonably fast
    });
  });

  describe("Content Management Performance", () => {
    it("should handle content operations efficiently", async () => {
      const validKey = TEST_API_KEYS.PREMIUM;

      const startTime = Date.now();
      const response = await fetch(`${PERF_BASE_URL}/api/v1/content/articles`, {
        headers: {
          Authorization: `Bearer ${validKey}`,
        },
      });
      const endTime = Date.now();

      expect(response.status).toBe(200);
      expect(endTime - startTime).toBeLessThan(200);
    });

    it("should handle content creation efficiently", async () => {
      const validKey = TEST_API_KEYS.PREMIUM;
      const article = {
        title: "Performance Test Article",
        content: "This is a test article for performance testing",
        published: false,
        tags: ["performance", "test"],
      };

      const startTime = Date.now();
      const response = await fetch(`${PERF_BASE_URL}/api/v1/content/articles`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(article),
      });
      const endTime = Date.now();

      expect(response.status).toBe(201);
      expect(endTime - startTime).toBeLessThan(250);
    });
  });

  describe("Error Handling Performance", () => {
    it("should handle 404 errors efficiently", async () => {
      const startTime = Date.now();
      const response = await fetch(`${PERF_BASE_URL}/non-existent-endpoint`);
      const endTime = Date.now();

      expect(response.status).toBe(404);
      expect(endTime - startTime).toBeLessThan(100); // Error handling should be fast
    });
  });

  describe("Load Testing", () => {
    it("should handle burst of requests", async () => {
      const burstSize = 20;
      const validKey = TEST_API_KEYS.PREMIUM;
      const tenantId = TEST_TENANTS.PREMIUM;

      const startTime = Date.now();

      const requests = Array.from({ length: burstSize }, (_, i) =>
        fetch(`${PERF_BASE_URL}/api/v1/tenant/${tenantId}/users`, {
          headers: {
            Authorization: `Bearer ${validKey}`,
            "X-Request-ID": `burst-${i}`,
          },
        })
      );

      const responses = await Promise.all(requests);
      const endTime = Date.now();

      // Most requests should succeed (some may be rate limited)
      const successfulRequests = responses.filter((r) => r.status === 200);
      expect(successfulRequests.length).toBeGreaterThan(burstSize * 0.5); // At least 50% should succeed

      // Total time should be reasonable for burst
      expect(endTime - startTime).toBeLessThan(2000); // Under 2 seconds for 20 requests

      const avgTime = (endTime - startTime) / burstSize;
      expect(avgTime).toBeLessThan(300); // Average under 300ms per request
    });
  });
});
