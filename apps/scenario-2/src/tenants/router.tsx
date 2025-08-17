import { Guard } from "reono";
import {
  tenantAuth,
  validateTenantId,
  requirePermission,
  requireSubscription,
  requireFeature,
  type Tenant,
  type User,
  type ApiKey,
  tenants,
  users,
  resolveTenant,
  hasPermission,
} from "../middleware/auth";
import {
  tenantRateLimit,
  analyticsRateLimit,
  billingRateLimit,
  sensitiveOperationRateLimit,
} from "../middleware/rate-limit";
import { tenantCors } from "../middleware/cors";

export function TenantRouter() {
  return (
    <use handler={tenantAuth}>
      <use handler={tenantCors}>
        <use handler={tenantRateLimit}>
          <router path="tenant/:tenantId">
            <use handler={validateTenantId}>
              {/* Tenant Information Routes */}
              <get
                path="info"
                handler={(c) => {
                  const tenant = (c as any).tenant as Tenant;
                  const user = (c as any).user as User;

                  // Filter sensitive information based on user role
                  const response = {
                    id: tenant.id,
                    name: tenant.name,
                    domain: tenant.domain,
                    subscription: tenant.subscription,
                    isActive: tenant.isActive,
                    createdAt: tenant.createdAt,
                    settings: {
                      features: tenant.settings.features,
                      dataRetention: tenant.settings.dataRetention,
                      // Only show custom fields to admins/owners
                      ...(user.role !== "user" && {
                        customFields: tenant.settings.customFields,
                      }),
                    },
                  };

                  return c.json(response);
                }}
              />

              {/* Tenant Settings (Admin/Owner only) */}
              <Guard
                condition={(c) => {
                  const user = (c as any).user as User;
                  return user.role === "admin" || user.role === "owner";
                }}
              >
                <put
                  path="settings"
                  handler={async (c) => {
                    const tenant = (c as any).tenant as Tenant;
                    const user = (c as any).user as User;
                    const body = await c.req.json();

                    // Validate settings update (simplified for demo)
                    const allowedUpdates = ["dataRetention"];
                    if (user.role === "owner") {
                      allowedUpdates.push("customFields", "allowedOrigins");
                    }

                    const updates: any = {};
                    for (const field of allowedUpdates) {
                      if (field in body) {
                        updates[field] = body[field];
                      }
                    }

                    return c.json({
                      message: "Settings updated successfully",
                      tenant: tenant.id,
                      updatedBy: user.id,
                      updates,
                      timestamp: new Date().toISOString(),
                    });
                  }}
                />
              </Guard>

              {/* Usage Analytics */}
              <Guard
                condition={(c) => {
                  const user = (c as any).user as User;
                  return hasPermission(user, "tenant:read");
                }}
              >
                <get
                  path="usage"
                  handler={(c) => {
                    const tenant = (c as any).tenant as Tenant;
                    const user = (c as any).user as User;

                    // Mock usage data
                    const usage = {
                      tenantId: tenant.id,
                      currentPeriod: {
                        requests: Math.floor(Math.random() * 10000),
                        storage: Math.floor(Math.random() * 1000000), // bytes
                        apiCalls: Math.floor(Math.random() * 5000),
                        lastUpdated: new Date().toISOString(),
                      },
                      limits: {
                        requests:
                          tenant.subscription === "free"
                            ? 100
                            : tenant.subscription === "premium"
                              ? 1000
                              : 10000,
                        storage:
                          tenant.subscription === "free"
                            ? 100000000 // 100MB
                            : tenant.subscription === "premium"
                              ? 1000000000 // 1GB
                              : 10000000000, // 10GB
                      },
                      subscription: tenant.subscription,
                    };

                    return c.json(usage);
                  }}
                />
              </Guard>

              {/* User Management (Tenant-scoped) */}
              <router path="users">
                <Guard
                  condition={(c) => {
                    const user = (c as any).user as User;
                    return hasPermission(user, "users:read");
                  }}
                >
                  <get
                    path=""
                    handler={(c) => {
                      const tenant = (c as any).tenant as Tenant;
                      const requestingUser = (c as any).user as User;

                      // Get users for this tenant
                      const tenantUsers = users.filter(
                        (u) => u.tenantId === tenant.id
                      );

                      // Filter user data based on requesting user's permissions
                      const filteredUsers = tenantUsers.map((user) => ({
                        id: user.id,
                        email: user.email,
                        name: user.name,
                        role: user.role,
                        isActive: user.isActive,
                        createdAt: user.createdAt,
                        // Only show permissions to admins/owners
                        ...(requestingUser.role !== "user" && {
                          permissions: user.permissions,
                        }),
                      }));

                      return c.json({
                        users: filteredUsers,
                        total: filteredUsers.length,
                        tenant: tenant.id,
                      });
                    }}
                  />
                </Guard>

                <Guard
                  condition={(c) => {
                    const user = (c as any).user as User;
                    return hasPermission(user, "users:read");
                  }}
                >
                  <get
                    path=":userId"
                    handler={(c) => {
                      const tenant = (c as any).tenant as Tenant;
                      const requestingUser = (c as any).user as User;
                      const userId = c.params.userId;

                      const user = users.find(
                        (u) => u.id === userId && u.tenantId === tenant.id
                      );

                      if (!user) {
                        return c.json(
                          {
                            error: "User not found",
                            message:
                              "User does not exist or does not belong to this tenant",
                          },
                          404
                        );
                      }

                      const response = {
                        id: user.id,
                        email: user.email,
                        name: user.name,
                        role: user.role,
                        isActive: user.isActive,
                        createdAt: user.createdAt,
                        // Only show permissions to admins/owners
                        ...(requestingUser.role !== "user" && {
                          permissions: user.permissions,
                        }),
                      };

                      return c.json(response);
                    }}
                  />
                </Guard>

                {/* User creation/updates require admin permissions */}
                <Guard
                  condition={(c) => {
                    const user = (c as any).user as User;
                    return hasPermission(user, "users:write");
                  }}
                >
                  <post
                    path=""
                    handler={async (c) => {
                      const tenant = (c as any).tenant as Tenant;
                      const requestingUser = (c as any).user as User;
                      const body = await c.req.json();

                      // Mock user creation
                      const newUser = {
                        id: `user-${Date.now()}`,
                        tenantId: tenant.id,
                        email: body.email,
                        name: body.name,
                        role: body.role || "user",
                        permissions: body.permissions || ["users:read"],
                        isActive: true,
                        createdAt: new Date(),
                      };

                      return c.json(
                        {
                          message: "User created successfully",
                          user: newUser,
                          createdBy: requestingUser.id,
                        },
                        201
                      );
                    }}
                  />
                </Guard>
              </router>

              {/* Analytics API (Premium+ only) */}
              <Guard
                condition={(c) => {
                  const tenant = (c as any).tenant as Tenant;
                  return (
                    tenant.subscription === "premium" ||
                    tenant.subscription === "enterprise"
                  );
                }}
              >
                <use handler={requireFeature("analytics")}>
                  <use handler={analyticsRateLimit}>
                    <router path="analytics">
                      <get
                        path=""
                        handler={(c) => {
                          const tenant = (c as any).tenant as Tenant;

                          // Mock basic analytics
                          const analytics = {
                            tenantId: tenant.id,
                            period: "last_30_days",
                            metrics: {
                              totalRequests: Math.floor(Math.random() * 50000),
                              uniqueUsers: Math.floor(Math.random() * 1000),
                              averageResponseTime:
                                Math.floor(Math.random() * 200) + 50,
                              errorRate: Math.random() * 0.05,
                              topEndpoints: [
                                {
                                  path: "/api/v1/users",
                                  requests: Math.floor(Math.random() * 10000),
                                },
                                {
                                  path: "/api/v1/tenant/info",
                                  requests: Math.floor(Math.random() * 5000),
                                },
                              ],
                            },
                            subscription: tenant.subscription,
                          };

                          return c.json(analytics);
                        }}
                      />

                      {/* Advanced Analytics (Enterprise only) */}
                      <Guard
                        condition={(c) => {
                          const tenant = (c as any).tenant as Tenant;
                          return tenant.subscription === "enterprise";
                        }}
                      >
                        <get
                          path="advanced"
                          handler={(c) => {
                            const tenant = (c as any).tenant as Tenant;

                            return c.json({
                              tenantId: tenant.id,
                              advancedMetrics: {
                                customEvents: Math.floor(Math.random() * 1000),
                                conversionRate: Math.random() * 0.3,
                                customerLifetimeValue: Math.floor(
                                  Math.random() * 5000
                                ),
                                churnRate: Math.random() * 0.1,
                                detailedBreakdown: {
                                  byGeography: { US: 45, EU: 30, APAC: 25 },
                                  byDevice: {
                                    mobile: 60,
                                    desktop: 35,
                                    tablet: 5,
                                  },
                                  bySource: {
                                    organic: 40,
                                    paid: 35,
                                    referral: 25,
                                  },
                                },
                              },
                              subscription: "enterprise",
                            });
                          }}
                        />

                        <get
                          path="export"
                          handler={(c) => {
                            const tenant = (c as any).tenant as Tenant;

                            return c.json({
                              message: "Data export initiated",
                              tenantId: tenant.id,
                              exportId: `export-${Date.now()}`,
                              estimatedCompletion: new Date(
                                Date.now() + 300000
                              ).toISOString(), // 5 minutes
                              downloadUrl:
                                "/api/v1/exports/export-" + Date.now(),
                              format: "CSV",
                              subscription: "enterprise",
                            });
                          }}
                        />
                      </Guard>
                    </router>
                  </use>
                </use>
              </Guard>

              {/* Billing API */}
              <Guard
                condition={(c) => {
                  const user = (c as any).user as User;
                  return hasPermission(user, "billing:read");
                }}
              >
                <use handler={billingRateLimit}>
                  <router path="billing">
                    <get
                      path="usage"
                      handler={(c) => {
                        const tenant = (c as any).tenant as Tenant;

                        const currentUsage = {
                          tenantId: tenant.id,
                          billingPeriod: "2024-08",
                          subscription: tenant.subscription,
                          usage: {
                            requests: Math.floor(Math.random() * 10000),
                            storage: Math.floor(Math.random() * 1000000000), // bytes
                            compute: Math.floor(Math.random() * 100), // compute hours
                          },
                          costs: {
                            base:
                              tenant.subscription === "free"
                                ? 0
                                : tenant.subscription === "premium"
                                  ? 99
                                  : 499,
                            overages: Math.floor(Math.random() * 50),
                            total:
                              tenant.subscription === "free"
                                ? 0
                                : tenant.subscription === "premium"
                                  ? 99 + Math.floor(Math.random() * 50)
                                  : 499 + Math.floor(Math.random() * 200),
                          },
                        };

                        return c.json(currentUsage);
                      }}
                    />

                    <get
                      path="invoices"
                      handler={(c) => {
                        const tenant = (c as any).tenant as Tenant;

                        const invoices = [
                          {
                            id: "inv-2024-08",
                            period: "2024-08",
                            amount:
                              tenant.subscription === "free"
                                ? 0
                                : tenant.subscription === "premium"
                                  ? 99
                                  : 499,
                            status: "paid",
                            dueDate: "2024-09-01",
                            paidDate: "2024-08-28",
                          },
                          {
                            id: "inv-2024-07",
                            period: "2024-07",
                            amount:
                              tenant.subscription === "free"
                                ? 0
                                : tenant.subscription === "premium"
                                  ? 99
                                  : 499,
                            status: "paid",
                            dueDate: "2024-08-01",
                            paidDate: "2024-07-29",
                          },
                        ];

                        return c.json({
                          tenantId: tenant.id,
                          invoices,
                          total: invoices.length,
                        });
                      }}
                    />

                    {/* Subscription upgrade (sensitive operation) */}
                    <Guard
                      condition={(c) => {
                        const user = (c as any).user as User;
                        return user.role === "admin" || user.role === "owner";
                      }}
                    >
                      <use handler={sensitiveOperationRateLimit}>
                        <post
                          path="upgrade"
                          handler={async (c) => {
                            const tenant = (c as any).tenant as Tenant;
                            const user = (c as any).user as User;
                            const body = await c.req.json();

                            const { targetTier } = body;

                            if (
                              !["free", "premium", "enterprise"].includes(
                                targetTier
                              )
                            ) {
                              return c.json(
                                {
                                  error: "Invalid subscription tier",
                                  validTiers: ["free", "premium", "enterprise"],
                                },
                                400
                              );
                            }

                            if (targetTier === tenant.subscription) {
                              return c.json(
                                {
                                  error: "Already on target subscription tier",
                                  currentTier: tenant.subscription,
                                },
                                400
                              );
                            }

                            return c.json({
                              message: "Subscription upgrade initiated",
                              tenantId: tenant.id,
                              currentTier: tenant.subscription,
                              targetTier,
                              estimatedActivation: new Date(
                                Date.now() + 3600000
                              ).toISOString(), // 1 hour
                              initiatedBy: user.id,
                              upgradeId: `upgrade-${Date.now()}`,
                            });
                          }}
                        />
                      </use>
                    </Guard>
                  </router>
                </use>
              </Guard>
            </use>
          </router>
        </use>
      </use>
    </use>
  );
}
