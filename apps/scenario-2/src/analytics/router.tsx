import { z } from "zod";
import {
  tenantAuth,
  validateTenantId,
  requirePermission,
  requireSubscription,
  requireFeature,
  type User,
  type Tenant,
} from "../middleware/auth";
import { analyticsRateLimit } from "../middleware/rate-limit";

// Mock analytics data
const analyticsData = {
  basic: {
    dailyUsers: 1250,
    totalRequests: 45000,
    avgResponseTime: 120,
    errorRate: 0.02,
  },
  advanced: {
    userRetention: {
      day1: 0.85,
      day7: 0.62,
      day30: 0.45,
    },
    geographicDistribution: {
      "North America": 45,
      Europe: 35,
      "Asia Pacific": 15,
      Other: 5,
    },
    deviceBreakdown: {
      mobile: 60,
      desktop: 35,
      tablet: 5,
    },
    revenueMetrics: {
      mrr: 125000,
      arpu: 89.5,
      churnRate: 0.05,
    },
  },
  enterprise: {
    customMetrics: {
      apiKeyUsage: {
        "key-1": { requests: 1500, lastUsed: "2024-08-16T10:30:00Z" },
        "key-2": { requests: 2800, lastUsed: "2024-08-16T11:15:00Z" },
        "key-3": { requests: 500, lastUsed: "2024-08-16T09:45:00Z" },
      },
      tenantHealth: {
        uptime: 99.98,
        avgLatency: 45,
        errorBudget: 0.98,
      },
      compliance: {
        dataRetentionDays: 365,
        encryptionStatus: "AES-256",
        auditLogRetention: "7 years",
      },
    },
  },
};

// Validation schemas
const analyticsParamsSchema = z.object({
  tenantId: z.string(),
});

const dateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  granularity: z.enum(["hour", "day", "week", "month"]).default("day"),
});

// Route handlers with subscription-aware data filtering
const getBasicAnalytics = (c: any) => {
  const tenant = c.tenant as Tenant;
  const user = c.user as User;

  // Basic analytics available for all tiers (premium+)
  return c.json({
    tenant: tenant.name,
    subscription: tenant.subscription,
    timeRange: "last_30_days",
    data: analyticsData.basic,
    generatedAt: new Date().toISOString(),
    user: {
      id: user.id,
      permissions: user.permissions,
    },
  });
};

const getAdvancedAnalytics = (c: any) => {
  const tenant = c.tenant as Tenant;
  const user = c.user as User;

  // Advanced analytics for premium+ tiers
  return c.json({
    tenant: tenant.name,
    subscription: tenant.subscription,
    timeRange: "last_30_days",
    basicMetrics: analyticsData.basic,
    advancedMetrics: analyticsData.advanced,
    generatedAt: new Date().toISOString(),
    user: {
      id: user.id,
      permissions: user.permissions,
    },
  });
};

const getEnterpriseAnalytics = (c: any) => {
  const tenant = c.tenant as Tenant;
  const user = c.user as User;

  // Full analytics suite for enterprise tier
  return c.json({
    tenant: tenant.name,
    subscription: tenant.subscription,
    timeRange: "last_30_days",
    basicMetrics: analyticsData.basic,
    advancedMetrics: analyticsData.advanced,
    enterpriseMetrics: analyticsData.enterprise,
    customFields: tenant.settings.customFields,
    generatedAt: new Date().toISOString(),
    user: {
      id: user.id,
      permissions: user.permissions,
    },
  });
};

const exportAnalyticsData = (c: any) => {
  const tenant = c.tenant as Tenant;
  const user = c.user as User;
  const { format } = c.query;

  // Enterprise-only data export
  const exportData = {
    exportId: `export-${Date.now()}`,
    tenant: tenant.name,
    subscription: tenant.subscription,
    format: format || "json",
    status: "pending",
    estimatedCompletionTime: "5 minutes",
    downloadUrl: `https://api.example.com/exports/download/${tenant.id}/analytics-${Date.now()}`,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
    requestedBy: user.email,
    generatedAt: new Date().toISOString(),
  };

  return c.json(exportData, 202); // Accepted
};

const getUsageMetrics = (c: any) => {
  const tenant = c.tenant as Tenant;
  const user = c.user as User;

  // Usage metrics for billing purposes
  const usageData = {
    tenant: tenant.name,
    subscription: tenant.subscription,
    billingPeriod: "2024-08",
    usage: {
      apiRequests: 45000,
      storageGB: 12.5,
      bandwidthGB: 156.7,
      activeUsers: 1250,
    },
    limits: {
      apiRequests:
        tenant.subscription === "free"
          ? 100000
          : tenant.subscription === "premium"
            ? 1000000
            : -1,
      storageGB:
        tenant.subscription === "free"
          ? 10
          : tenant.subscription === "premium"
            ? 100
            : -1,
      bandwidthGB:
        tenant.subscription === "free"
          ? 100
          : tenant.subscription === "premium"
            ? 1000
            : -1,
    },
    overage: {
      apiRequests: 0,
      storageGB: 2.5,
      bandwidthGB: 0,
    },
    estimatedCost:
      tenant.subscription === "free"
        ? 0
        : tenant.subscription === "premium"
          ? 99.0
          : 499.0,
    generatedAt: new Date().toISOString(),
  };

  return c.json(usageData);
};

// Multi-tenant Analytics JSX Router Component
export const AnalyticsRouter = () => (
  <router path="tenant/:tenantId/analytics">
    <use handler={tenantAuth}>
      <use handler={validateTenantId}>
        <use handler={analyticsRateLimit}>
          {/* Basic analytics - Premium+ subscriptions only */}
          <use handler={requireSubscription("premium", "enterprise")}>
            <use handler={requireFeature("analytics")}>
              <use handler={requirePermission("analytics:read")}>
                <get
                  path=""
                  validate={{ params: analyticsParamsSchema }}
                  handler={getBasicAnalytics}
                />
              </use>
            </use>
          </use>

          {/* Advanced analytics - Premium+ subscriptions */}
          <use handler={requireSubscription("premium", "enterprise")}>
            <use handler={requireFeature("advanced-reporting")}>
              <use handler={requirePermission("analytics:read")}>
                <get
                  path="advanced"
                  validate={{
                    params: analyticsParamsSchema,
                    query: dateRangeSchema,
                  }}
                  handler={getAdvancedAnalytics}
                />
              </use>
            </use>
          </use>

          {/* Enterprise analytics - Enterprise only */}
          <use handler={requireSubscription("enterprise")}>
            <use handler={requireFeature("custom-integrations")}>
              <use handler={requirePermission("analytics:read")}>
                <get
                  path="enterprise"
                  validate={{ params: analyticsParamsSchema }}
                  handler={getEnterpriseAnalytics}
                />
              </use>
            </use>
          </use>

          {/* Data export - Enterprise only */}
          <use handler={requireSubscription("enterprise")}>
            <use handler={requireFeature("advanced-reporting")}>
              <use handler={requirePermission("analytics:export")}>
                <post
                  path="export"
                  validate={{ params: analyticsParamsSchema }}
                  handler={exportAnalyticsData}
                />
              </use>
            </use>
          </use>

          {/* Usage metrics for billing - All tiers */}
          <use handler={requirePermission("billing:read")}>
            <get
              path="usage"
              validate={{ params: analyticsParamsSchema }}
              handler={getUsageMetrics}
            />
          </use>
        </use>
      </use>
    </use>
  </router>
);
