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
import { createApi } from "../generated/api"; // Use the generated type-safe client factory

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

describe("Scenario 2: Type-Safe Generated Client Integration", () => {
  let app: any;
  let server: any;
  let api: ReturnType<typeof createApi>;

  beforeAll(async () => {
    // Start test server
    app = createApp();
    app.serve(<App />);

    await new Promise<void>((resolve) => {
      server = app.listen(TEST_PORT, () => resolve());
    });

    const TEST_BASE_URL = createTEST_BASE_URL(TEST_PORT);

    // Create the type-safe generated client
    api = createApi({ baseUrl: TEST_BASE_URL });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  it("health via type-safe client", async () => {
    const data = await api.get("/health");
    expect(data.status).toBe("ok");
  });

  it("catch-all route via type-safe client", async () => {
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

  it("tenant user by ID via type-safe client", async () => {
    // Test a parameterized route with proper type safety
    const data = await api.get("/api/v1/tenant/:tenantId/users/:userId", {
      params: { tenantId: TEST_TENANTS.FREE, userId: "123" },
      headers: { Authorization: `Bearer ${TEST_API_KEYS.FREE}` },
    });
    expect(data).toHaveProperty("id");
    expect(data).toHaveProperty("email");
    expect(data).toHaveProperty("name");
    expect(data).toHaveProperty("role");
  });

  it("tenant info via type-safe client", async () => {
    // Test another parameterized route
    const data = await api.get("/api/v1/tenant/:tenantId/info", {
      params: { tenantId: TEST_TENANTS.PREMIUM },
      headers: { Authorization: `Bearer ${TEST_API_KEYS.PREMIUM}` },
    });
    expect(data).toHaveProperty("id");
    expect(data).toHaveProperty("name");
    expect(data).toHaveProperty("domain");
    expect(data).toHaveProperty("subscription");
  });

  it("type safety - missing params should cause compile error", async () => {
    // This test demonstrates type safety by showing what would be a compile-time error
    try {
      // @ts-expect-error - This should fail because params are required for parameterized routes
      const data = await api.get("/api/v1/tenant/:tenantId/info");
    } catch (error) {
      // Expected to fail at runtime since TypeScript would catch this at compile time
      console.log("Runtime error as expected:", error);
    }
  });
});
