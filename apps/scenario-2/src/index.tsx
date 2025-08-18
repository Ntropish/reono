import { createApp } from "@reono/node-server";
import { z } from "zod";
import { TenantRouter } from "./tenants/router";
import { UserRouter } from "./users/router";
import { AnalyticsRouter } from "./analytics/router";
import { BillingRouter } from "./billing/router";
import { ContentRouter } from "./content/router";
import { basicCors as cors } from "./middleware/cors";
import { logger } from "./middleware/logger";
import { errorHandler } from "./middleware/error-handler";
import { globalRateLimit } from "./middleware/rate-limit";

const App = () => {
  return (
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
              {/* API v1 routes */}
              <router path="v1">
                {/* Tenant management routes */}
                <TenantRouter />

                {/* Multi-tenant user management */}
                <UserRouter />

                {/* Analytics API (Premium+ tiers) */}
                <AnalyticsRouter />

                {/* Billing API */}
                <BillingRouter />

                {/* Content Management System */}
                <ContentRouter />
              </router>

              {/* API v2 routes (future expansion) */}
              <router path="v2">
                <get
                  path="*"
                  handler={(c) =>
                    c.json(
                      {
                        message: "API v2 coming soon",
                        availableVersions: ["v1"],
                        currentVersion: "v1",
                        upgradeInfo:
                          "https://docs.example.com/api/v2-migration",
                        v2Features: [
                          "Enhanced rate limiting",
                          "GraphQL support",
                          "Real-time subscriptions",
                          "Advanced analytics",
                        ],
                      },
                      501
                    )
                  }
                />
              </router>
            </router>

            {/* Static documentation routes */}
            <router path="docs">
              <get
                path=""
                handler={(c) =>
                  c.json({
                    message: "API Documentation",
                    versions: {
                      v1: "/docs/v1",
                      v2: "/docs/v2 (coming soon)",
                    },
                    interactive: "/docs/interactive",
                    examples: "/docs/examples",
                  })
                }
              />

              <get
                path="v1"
                handler={(c) =>
                  c.json({
                    title: "Multi-Tenant SaaS API Gateway v1",
                    description:
                      "Complete API documentation for tenant-aware SaaS platform",
                    baseUrl: `${c.url.protocol}//${c.url.host}/api/v1`,
                    authentication: "Bearer token (API key)",
                    rateLimit: "Varies by subscription tier",
                    endpoints: {
                      tenant: "/tenant/{tenantId}/*",
                      users: "/tenant/{tenantId}/users/*",
                      analytics: "/tenant/{tenantId}/analytics/*",
                      billing: "/tenant/{tenantId}/billing/*",
                    },
                  })
                }
              />
            </router>

            {/* Catch-all for undefined routes */}
            <get
              path="*"
              handler={(c) =>
                c.json(
                  {
                    error: "Endpoint not found",
                    message: "This endpoint does not exist",
                    availableEndpoints: {
                      health: "/health",
                      api: "/api/v1",
                      docs: "/docs",
                    },
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
};

export default App;
