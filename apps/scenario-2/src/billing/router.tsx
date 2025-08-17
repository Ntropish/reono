import { z } from "zod";
import {
  tenantAuth,
  validateTenantId,
  requirePermission,
  requireSubscription,
  type User,
  type Tenant,
} from "../middleware/auth";
import {
  billingRateLimit,
  sensitiveOperationRateLimit,
} from "../middleware/rate-limit";

// Mock billing data
const billingData = {
  subscriptions: {
    "tenant-1": {
      id: "sub_acme_001",
      tier: "free",
      status: "active",
      currentPeriodStart: "2024-08-01T00:00:00Z",
      currentPeriodEnd: "2024-09-01T00:00:00Z",
      amount: 0,
      currency: "USD",
    },
    "tenant-2": {
      id: "sub_tech_002",
      tier: "premium",
      status: "active",
      currentPeriodStart: "2024-08-01T00:00:00Z",
      currentPeriodEnd: "2024-09-01T00:00:00Z",
      amount: 99.0,
      currency: "USD",
    },
    "tenant-3": {
      id: "sub_big_003",
      tier: "enterprise",
      status: "active",
      currentPeriodStart: "2024-08-01T00:00:00Z",
      currentPeriodEnd: "2024-09-01T00:00:00Z",
      amount: 499.0,
      currency: "USD",
    },
  },
  invoices: {
    "tenant-1": [],
    "tenant-2": [
      {
        id: "inv_tech_202408",
        amount: 99.0,
        currency: "USD",
        status: "paid",
        paidAt: "2024-08-01T12:00:00Z",
        dueDate: "2024-08-15T23:59:59Z",
        downloadUrl: "https://billing.example.com/invoices/inv_tech_202408.pdf",
      },
    ],
    "tenant-3": [
      {
        id: "inv_big_202408",
        amount: 499.0,
        currency: "USD",
        status: "paid",
        paidAt: "2024-08-01T09:30:00Z",
        dueDate: "2024-08-15T23:59:59Z",
        downloadUrl: "https://billing.example.com/invoices/inv_big_202408.pdf",
      },
    ],
  },
};

// Validation schemas
const billingParamsSchema = z.object({
  tenantId: z.string(),
});

const upgradeSchema = z.object({
  targetTier: z.enum(["premium", "enterprise"]),
  paymentMethodId: z.string().optional(),
  billingCycle: z.enum(["monthly", "annual"]).default("monthly"),
});

// Route handlers
const getCurrentSubscription = (c: any) => {
  const tenant = c.tenant as Tenant;
  const user = c.user as User;

  const subscription =
    billingData.subscriptions[
      tenant.id as keyof typeof billingData.subscriptions
    ];

  if (!subscription) {
    return new Response(
      JSON.stringify({
        error: "Subscription not found",
        tenantId: tenant.id,
      }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return c.json({
    tenant: tenant.name,
    subscription: {
      ...subscription,
      features: tenant.settings.features,
      limits: {
        requestsPerHour:
          tenant.subscription === "free"
            ? 100
            : tenant.subscription === "premium"
              ? 1000
              : 10000,
        storageGB:
          tenant.subscription === "free"
            ? 10
            : tenant.subscription === "premium"
              ? 100
              : -1,
        users:
          tenant.subscription === "free"
            ? 5
            : tenant.subscription === "premium"
              ? 50
              : -1,
      },
    },
    requestedBy: user.email,
    generatedAt: new Date().toISOString(),
  });
};

const getUsageData = (c: any) => {
  const tenant = c.tenant as Tenant;
  const user = c.user as User;

  // Current usage data for billing calculations
  const usage = {
    tenant: tenant.name,
    subscription: tenant.subscription,
    billingPeriod: {
      start: "2024-08-01T00:00:00Z",
      end: "2024-09-01T00:00:00Z",
      daysRemaining: 15,
    },
    currentUsage: {
      apiRequests: 45000,
      storageGB: 12.5,
      activeUsers: 8,
      bandwidthGB: 156.7,
    },
    projectedUsage: {
      apiRequests: 62000,
      storageGB: 14.2,
      activeUsers: 10,
      bandwidthGB: 215.8,
    },
    overage: {
      apiRequests:
        tenant.subscription === "free" ? Math.max(0, 45000 - 10000) : 0,
      storageGB: tenant.subscription === "free" ? Math.max(0, 12.5 - 10) : 0,
      activeUsers: tenant.subscription === "free" ? Math.max(0, 8 - 5) : 0,
    },
    estimatedCost: {
      base:
        tenant.subscription === "free"
          ? 0
          : tenant.subscription === "premium"
            ? 99.0
            : 499.0,
      overage: tenant.subscription === "free" ? 35.0 : 0, // $10/1000 requests, $5/GB
      total:
        tenant.subscription === "free"
          ? 35.0
          : tenant.subscription === "premium"
            ? 99.0
            : 499.0,
    },
    generatedAt: new Date().toISOString(),
  };

  return c.json(usage);
};

const getInvoiceHistory = (c: any) => {
  const tenant = c.tenant as Tenant;
  const user = c.user as User;

  const invoices =
    billingData.invoices[tenant.id as keyof typeof billingData.invoices] || [];

  return c.json({
    tenant: tenant.name,
    subscription: tenant.subscription,
    invoices: invoices.map((invoice) => ({
      ...invoice,
      // Mask sensitive data for non-admin users
      downloadUrl:
        user.role === "admin" || user.role === "owner"
          ? invoice.downloadUrl
          : undefined,
    })),
    total: invoices.length,
    requestedBy: user.email,
    generatedAt: new Date().toISOString(),
  });
};

const upgradeSubscription = (c: any) => {
  const tenant = c.tenant as Tenant;
  const user = c.user as User;
  const { targetTier, paymentMethodId, billingCycle } = c.body;

  // Validate upgrade path
  const currentTier = tenant.subscription;
  const tierHierarchy: Record<string, number> = {
    free: 0,
    premium: 1,
    enterprise: 2,
  };

  if ((tierHierarchy[targetTier] || 0) <= (tierHierarchy[currentTier] || 0)) {
    return new Response(
      JSON.stringify({
        error: "Invalid upgrade",
        message: `Cannot upgrade from ${currentTier} to ${targetTier}`,
        currentTier,
        targetTier,
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Simulate upgrade process
  const upgrade = {
    upgradeId: `upgrade_${Date.now()}`,
    tenant: tenant.name,
    tenantId: tenant.id,
    from: currentTier,
    to: targetTier,
    billingCycle,
    status: "pending_payment",
    estimatedCost:
      (
        {
          premium: billingCycle === "monthly" ? 99.0 : 990.0,
          enterprise: billingCycle === "monthly" ? 499.0 : 4990.0,
        } as Record<string, number>
      )[targetTier] || 0,
    effectiveDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
    paymentDue: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    newFeatures:
      targetTier === "premium"
        ? ["analytics", "advanced-reporting", "priority-support"]
        : [
            "analytics",
            "advanced-reporting",
            "white-label",
            "custom-integrations",
            "dedicated-support",
          ],
    requestedBy: user.email,
    createdAt: new Date().toISOString(),
  };

  return c.json(upgrade, 202); // Accepted
};

const cancelSubscription = (c: any) => {
  const tenant = c.tenant as Tenant;
  const user = c.user as User;

  // Only allow cancellation for paid tiers
  if (tenant.subscription === "free") {
    return new Response(
      JSON.stringify({
        error: "Cannot cancel free subscription",
        message: "Free tier subscriptions cannot be cancelled",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const cancellation = {
    cancellationId: `cancel_${Date.now()}`,
    tenant: tenant.name,
    tenantId: tenant.id,
    currentTier: tenant.subscription,
    status: "scheduled",
    effectiveDate: "2024-09-01T00:00:00Z", // End of current billing period
    downgradeToTier: "free",
    refundAmount: 0, // No refund, use until period end
    dataRetention: {
      duration: "30 days",
      downloadAvailable: true,
      deletionDate: "2024-10-01T00:00:00Z",
    },
    requestedBy: user.email,
    requestedAt: new Date().toISOString(),
  };

  return c.json(cancellation, 202); // Accepted
};

// Multi-tenant Billing JSX Router Component
export const BillingRouter = () => (
  <router path="tenant/:tenantId/billing">
    <use handler={tenantAuth}>
      <use handler={validateTenantId}>
        <use handler={billingRateLimit}>
          {/* Current subscription info - All authenticated users */}
          <use handler={requirePermission("billing:read")}>
            <get
              path=""
              validate={{ params: billingParamsSchema }}
              handler={getCurrentSubscription}
            />
          </use>

          {/* Usage data for current billing period */}
          <use handler={requirePermission("billing:read")}>
            <get
              path="usage"
              validate={{ params: billingParamsSchema }}
              handler={getUsageData}
            />
          </use>

          {/* Invoice history */}
          <use handler={requirePermission("billing:read")}>
            <get
              path="invoices"
              validate={{ params: billingParamsSchema }}
              handler={getInvoiceHistory}
            />
          </use>

          {/* Sensitive billing operations - Require special rate limiting */}
          <use handler={sensitiveOperationRateLimit}>
            {/* Upgrade subscription - Admin/Owner only */}
            <use handler={requirePermission("billing:write")}>
              <post
                path="upgrade"
                validate={{
                  params: billingParamsSchema,
                  body: upgradeSchema,
                }}
                handler={upgradeSubscription}
              />
            </use>

            {/* Cancel subscription - Owner only (strictest permission) */}
            <use handler={requirePermission("billing:cancel")}>
              <post
                path="cancel"
                validate={{ params: billingParamsSchema }}
                handler={cancelSubscription}
              />
            </use>
          </use>
        </use>
      </use>
    </use>
  </router>
);
