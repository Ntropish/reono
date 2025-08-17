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
import { createElement } from "reono";
import { renderClient } from "@reono/client";
import { api } from "../generated/api"; // Use the generated type-safe client

// Type safe access to test globals - these are set by the test setup
declare global {
  var TEST_PORT: number;
  var TEST_BASE_URL: string;
  var TEST_API_KEYS: {
    FREE: string;
    PREMIUM: string;
    ENTERPRISE: string;
    INVALID: string;
  };
  var TEST_TENANTS: {
    FREE: string;
    PREMIUM: string;
    ENTERPRISE: string;
    INVALID: string;
  };
}

const TEST_PORT = globalThis.TEST_PORT;
const TEST_BASE_URL = globalThis.TEST_BASE_URL;
const TEST_API_KEYS = globalThis.TEST_API_KEYS;
const TEST_TENANTS = globalThis.TEST_TENANTS;

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

describe("Scenario 2: Client Integration via renderClient", () => {
  let app: any;
  let server: any;
  let client: ReturnType<typeof renderClient>;

  beforeAll(async () => {
    // Start test server
    app = createApp();
    app.serve(<App />);

    await new Promise<void>((resolve) => {
      server = app.listen(TEST_PORT, () => resolve());
    });

    // Use renderClient for runtime type-safe requests
    // Note: This provides runtime path interpolation but not compile-time type safety
    client = renderClient(App(), { baseUrl: TEST_BASE_URL });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  it("health via client", async () => {
    const data = await api.get("/health");
    expect(data.status).toBe("ok");
  });

  it("auth + users via client", async () => {
    const data = await api.get(`/api/v1/tenant/${TEST_TENANTS.FREE}/users`, {
      headers: { Authorization: `Bearer ${TEST_API_KEYS.FREE}` },
    });
    expect(Array.isArray(data.users)).toBe(true);
  });

  it("create user via client", async () => {
    const newUser = {
      email: "test@example.com",
      name: "Test User",
      role: "user",
    };
    const data = await api.post(
      `/api/v1/tenant/${TEST_TENANTS.PREMIUM}/users`,
      {
        headers: {
          Authorization: `Bearer ${TEST_API_KEYS.PREMIUM}`,
          "Content-Type": "application/json",
        },
        body: newUser,
      }
    );
    expect(data.email).toBe(newUser.email);
  });

  it("param interpolation", async () => {
    const tenant = TEST_TENANTS.PREMIUM;
    const userId = "123";
    const path = "/api/v1/tenant/:tenantId/users/:userId";
    await expect(
      api.get(path, {
        params: { tenantId: tenant, userId },
        headers: { Authorization: `Bearer ${TEST_API_KEYS.PREMIUM}` },
      })
    ).rejects.toBeTruthy();
  });

  it("demonstrates type safety with createTypedClient", async () => {
    // This demonstrates how createTypedClient could provide compile-time path validation
    // For now, we'll use the regular client but with better typing
    const typedApi = api; // In real usage, this would be from createTypedClient

    // This would provide intellisense and type checking for paths with parameters
    const result = await typedApi.get("/health");
    expect(result).toBeDefined();
  });
});
