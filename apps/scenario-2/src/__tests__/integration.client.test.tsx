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

import { createTEST_BASE_URL, TEST_API_KEYS, TEST_TENANTS } from "./util";

const TEST_PORT = 8024;

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

    const TEST_BASE_URL = createTEST_BASE_URL(TEST_PORT);

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

  it("catch-all route via client", async () => {
    // Test the catch-all route which handles unmatched paths

    try {
      await api.get("/*");
      // should throw an error since this path does not exist
      throw new Error("Expected an error for catch-all route");
    } catch (error: any) {
      expect(error).toBeDefined();
      expect(error.status).toBe(404);

      // partially check the error data
      expect(error.data).toHaveProperty("error", "Endpoint not found");
      expect(error.data).toHaveProperty(
        "message",
        "This endpoint does not exist"
      );
    }
  });

  it("auth + users via renderClient (fallback)", async () => {
    // Since the generated client doesn't yet support nested routes,
    // we fall back to the renderClient for dynamic routes
    const data = await client.get(`/api/v1/tenant/${TEST_TENANTS.FREE}/users`, {
      headers: { Authorization: `Bearer ${TEST_API_KEYS.FREE}` },
    });
    expect(data).toHaveProperty("users");
    expect(Array.isArray(data.users)).toBe(true);
  });

  it("create user via renderClient (fallback)", async () => {
    const newUser = {
      email: "test@example.com",
      name: "Test User",
      role: "user",
    };
    // Using renderClient since the generated client doesn't support POST yet
    const data = await client.post(
      `/api/v1/tenant/${TEST_TENANTS.PREMIUM}/users`,
      {
        headers: {
          Authorization: `Bearer ${TEST_API_KEYS.PREMIUM}`,
          "Content-Type": "application/json",
        },
        body: newUser,
      }
    );
    expect(data).toHaveProperty("email", newUser.email);
  });

  it("param interpolation via renderClient", async () => {
    const tenant = TEST_TENANTS.PREMIUM;
    const userId = "123";
    const path = "/api/v1/tenant/:tenantId/users/:userId";
    await expect(
      client.get(path, {
        params: { tenantId: tenant, userId },
        headers: { Authorization: `Bearer ${TEST_API_KEYS.PREMIUM}` },
      })
    ).rejects.toBeTruthy();
  });
});
