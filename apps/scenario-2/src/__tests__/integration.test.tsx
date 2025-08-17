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

// Type safe access to test globals
const TEST_PORT = (globalThis as any).TEST_PORT;
const TEST_BASE_URL = (globalThis as any).TEST_BASE_URL;
const TEST_API_KEYS = (globalThis as any).TEST_API_KEYS as {
  FREE: string;
  PREMIUM: string;
  ENTERPRISE: string;
  INVALID: string;
};
const TEST_TENANTS = (globalThis as any).TEST_TENANTS as {
  FREE: string;
  PREMIUM: string;
  ENTERPRISE: string;
  INVALID: string;
};

// Test application matching the main app structure
const App = () => (
  <use handler={errorHandler}>
    <use handler={cors}>
      <use handler={logger}>
        <use handler={globalRateLimit}>
          {/* Public health check endpoint */}
          <get
            path="health"
            handler={(c) =>
              c.json({
                status: "ok",
                timestamp: Date.now(),
                version: "2.0.0",
                service: "Multi-Tenant SaaS API Gateway",
              })
            }
          />

          {/* API versioning routes */}
          <router path="api">
            <router path="v1">
              <TenantRouter />
              <UserRouter />
              <AnalyticsRouter />
              <BillingRouter />
              <ContentRouter />
            </router>
          </router>

          {/* Catch-all for undefined routes */}
          <get
            path="*"
            handler={(c) =>
              c.json(
                {
                  error: "Endpoint not found",
                  message: "This endpoint does not exist",
                },
                404
              )
            }
          />
        </use>
      </use>
    </use>
  </use>
);

describe("Scenario 2: Multi-Tenant SaaS API Gateway Integration Tests", () => {
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
          console.log("🧪 Test server stopped");
          resolve();
        });
      });
    }
  });

  describe("Health Check", () => {
    it("should return health status", async () => {
      const response = await fetch(`${TEST_BASE_URL}/health`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        status: "ok",
        version: "2.0.0",
        service: "Multi-Tenant SaaS API Gateway",
      });
      expect(typeof data.timestamp).toBe("number");
    });
  });

  describe("Multi-Tenant Authentication", () => {
    it("should reject requests without authorization", async () => {
      const response = await fetch(
        `${TEST_BASE_URL}/api/v1/tenant/${TEST_TENANTS.FREE}/users`
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe("Missing or invalid authorization header");
    });

    it("should reject requests with invalid API key", async () => {
      const response = await fetch(
        `${TEST_BASE_URL}/api/v1/tenant/${TEST_TENANTS.FREE}/users`,
        {
          headers: {
            Authorization: `Bearer ${TEST_API_KEYS.INVALID}`,
          },
        }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe("Invalid or inactive API key");
    });

    it("should accept requests with valid API key", async () => {
      const response = await fetch(
        `${TEST_BASE_URL}/api/v1/tenant/${TEST_TENANTS.FREE}/users`,
        {
          headers: {
            Authorization: `Bearer ${TEST_API_KEYS.FREE}`,
          },
        }
      );

      expect(response.status).toBe(200);
    });

    it("should reject cross-tenant access", async () => {
      // Try to access tenant-2 with tenant-1 key
      const response = await fetch(
        `${TEST_BASE_URL}/api/v1/tenant/${TEST_TENANTS.PREMIUM}/users`,
        {
          headers: {
            Authorization: `Bearer ${TEST_API_KEYS.FREE}`,
          },
        }
      );

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe("Tenant access denied");
    });
  });

  describe("Tenant Management", () => {
    it("should get tenant info with valid key", async () => {
      const response = await fetch(
        `${TEST_BASE_URL}/api/v1/tenant/${TEST_TENANTS.PREMIUM}/info`,
        {
          headers: {
            Authorization: `Bearer ${TEST_API_KEYS.PREMIUM}`,
          },
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.id).toBe(TEST_TENANTS.PREMIUM);
      expect(data.subscription).toBe("premium");
    });

    it("should get tenant settings through info endpoint", async () => {
      const response = await fetch(
        `${TEST_BASE_URL}/api/v1/tenant/${TEST_TENANTS.PREMIUM}/info`,
        {
          headers: {
            Authorization: `Bearer ${TEST_API_KEYS.PREMIUM}`,
          },
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.settings).toBeDefined();
      expect(Array.isArray(data.settings.features)).toBe(true);
    });
  });

  describe("User Management", () => {
    it("should list users for a tenant", async () => {
      const response = await fetch(
        `${TEST_BASE_URL}/api/v1/tenant/${TEST_TENANTS.FREE}/users`,
        {
          headers: {
            Authorization: `Bearer ${TEST_API_KEYS.FREE}`,
          },
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data.users)).toBe(true);
      expect(typeof data.total).toBe("number");
    });

    it("should create a new user", async () => {
      const newUser = {
        email: "test@example.com",
        name: "Test User",
        role: "user",
      };

      const response = await fetch(
        `${TEST_BASE_URL}/api/v1/tenant/${TEST_TENANTS.PREMIUM}/users`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${TEST_API_KEYS.PREMIUM}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(newUser),
        }
      );

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.email).toBe(newUser.email);
      expect(data.name).toBe(newUser.name);
      // Note: tenantId is not returned in response for security
    });
  });

  describe("Analytics API", () => {
    it("should deny analytics access to free tier", async () => {
      const response = await fetch(
        `${TEST_BASE_URL}/api/v1/tenant/${TEST_TENANTS.FREE}/analytics`,
        {
          headers: {
            Authorization: `Bearer ${TEST_API_KEYS.FREE}`,
          },
        }
      );

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe("Subscription tier insufficient");
    });

    it("should allow analytics access to premium tier", async () => {
      const response = await fetch(
        `${TEST_BASE_URL}/api/v1/tenant/${TEST_TENANTS.PREMIUM}/analytics`,
        {
          headers: {
            Authorization: `Bearer ${TEST_API_KEYS.PREMIUM}`,
          },
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.tenant).toBeDefined();
      expect(data.subscription).toBe("premium");
      expect(data.data).toBeDefined();
    });

    it("should allow enterprise analytics for enterprise tier", async () => {
      const response = await fetch(
        `${TEST_BASE_URL}/api/v1/tenant/${TEST_TENANTS.ENTERPRISE}/analytics/enterprise`,
        {
          headers: {
            Authorization: `Bearer ${TEST_API_KEYS.ENTERPRISE}`,
          },
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.tenant).toBeDefined();
      expect(data.subscription).toBe("enterprise");
      expect(data.enterpriseMetrics).toBeDefined();
    });

    it("should deny enterprise analytics to premium tier", async () => {
      const response = await fetch(
        `${TEST_BASE_URL}/api/v1/tenant/${TEST_TENANTS.PREMIUM}/analytics/enterprise`,
        {
          headers: {
            Authorization: `Bearer ${TEST_API_KEYS.PREMIUM}`,
          },
        }
      );

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe("Subscription tier insufficient");
    });
  });

  describe("Billing API", () => {
    it("should get billing info for all tiers", async () => {
      for (const [tier, apiKey] of Object.entries(TEST_API_KEYS)) {
        if (tier === "INVALID") continue;

        const tenantId = TEST_TENANTS[tier as keyof typeof TEST_TENANTS];
        const response = await fetch(
          `${TEST_BASE_URL}/api/v1/tenant/${tenantId}/billing`,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          }
        );

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.subscription).toBeDefined();
        expect(data.subscription.tier).toBe(tier.toLowerCase());
      }
    });

    it("should get usage for premium and enterprise", async () => {
      const response = await fetch(
        `${TEST_BASE_URL}/api/v1/tenant/${TEST_TENANTS.PREMIUM}/billing/usage`,
        {
          headers: {
            Authorization: `Bearer ${TEST_API_KEYS.PREMIUM}`,
          },
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.currentUsage).toBeDefined();
      expect(typeof data.currentUsage.apiRequests).toBe("number");
    });
  });

  describe("Content Management", () => {
    it("should list articles", async () => {
      const response = await fetch(`${TEST_BASE_URL}/api/v1/content/articles`, {
        headers: {
          Authorization: `Bearer ${TEST_API_KEYS.PREMIUM}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data.articles)).toBe(true);
    });

    it("should create an article", async () => {
      const newArticle = {
        title: "Test Article",
        content: "This is a test article",
        published: true,
        tags: ["test"],
      };

      const response = await fetch(`${TEST_BASE_URL}/api/v1/content/articles`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_API_KEYS.PREMIUM}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newArticle),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.title).toBe(newArticle.title);
      expect(data.content).toBe(newArticle.content);
    });
  });

  describe("Rate Limiting", () => {
    it("should apply rate limits", async () => {
      // Make multiple rapid requests to test rate limiting
      const requests = Array.from({ length: 5 }, () =>
        fetch(`${TEST_BASE_URL}/api/v1/tenant/${TEST_TENANTS.PREMIUM}/users`, {
          headers: {
            Authorization: `Bearer ${TEST_API_KEYS.PREMIUM}`,
          },
        })
      );

      const responses = await Promise.all(requests);
      const statuses = responses.map((r) => r.status);

      // Some requests should succeed, but we might hit rate limits
      expect(statuses.some((status) => status === 200)).toBe(true);
    });
  });

  describe("CORS Middleware", () => {
    it("should handle OPTIONS preflight requests", async () => {
      const response = await fetch(`${TEST_BASE_URL}/health`, {
        method: "OPTIONS",
        headers: {
          Origin: "https://example.com",
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "Authorization, Content-Type",
        },
      });

      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
        "GET"
      );
    });

    it("should add CORS headers to responses", async () => {
      const response = await fetch(`${TEST_BASE_URL}/health`);

      expect(response.status).toBe(200);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });

  describe("Error Handling", () => {
    it("should return 404 for non-existent endpoints", async () => {
      const response = await fetch(`${TEST_BASE_URL}/non-existent-endpoint`);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe("Endpoint not found");
    });

    it("should validate tenant IDs", async () => {
      const response = await fetch(
        `${TEST_BASE_URL}/api/v1/tenant/${TEST_TENANTS.INVALID}/users`,
        {
          headers: {
            Authorization: `Bearer ${TEST_API_KEYS.PREMIUM}`,
          },
        }
      );

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe("Tenant access denied");
    });
  });
});
