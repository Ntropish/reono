// API Definition for Client Generation
// This file is used by the @reono/client plugin to generate type-safe clients

import { TenantRouter } from "./tenants/router";
import { UserRouter } from "./users/router";
import { AnalyticsRouter } from "./analytics/router";
import { BillingRouter } from "./billing/router";
import { ContentRouter } from "./content/router";
import { basicCors as cors } from "./middleware/cors";
import { logger } from "./middleware/logger";
import { errorHandler } from "./middleware/error-handler";
import { globalRateLimit } from "./middleware/rate-limit";

// This matches the main app structure for type-safe client generation
export const ApiDefinition = () => (
  <use handler={errorHandler}>
    <use handler={cors}>
      <use handler={logger}>
        <use handler={globalRateLimit}>
          {/* Public health check endpoint */}
          <get
            path="/health"
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
          <router path="/api">
            <router path="/v1">
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
