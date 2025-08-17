import { type MiddlewareHandler } from "reono";

// Multi-tenant data models
export interface Tenant {
  id: string;
  name: string;
  domain: string;
  subscription: "free" | "premium" | "enterprise";
  isActive: boolean;
  settings: TenantSettings;
  createdAt: Date;
}

export interface TenantSettings {
  allowedOrigins: string[];
  features: string[];
  dataRetention: number; // days
  customFields: Record<string, any>;
}

export interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: "user" | "admin" | "owner";
  permissions: string[];
  isActive: boolean;
  createdAt: Date;
}

export interface ApiKey {
  id: string;
  tenantId: string;
  userId: string;
  key: string;
  scopes: string[];
  rateLimit: RateLimitTier;
  createdAt: Date;
  expiresAt?: Date;
  isActive: boolean;
}

export interface RateLimitTier {
  requestsPerHour: number;
  burstLimit: number;
  concurrent: number;
}

// Sample tenant data for demo
const tenants: Tenant[] = [
  {
    id: "tenant-1",
    name: "AcmeCorp",
    domain: "acme.example.com",
    subscription: "free",
    isActive: true,
    settings: {
      allowedOrigins: ["https://acme.example.com"],
      features: ["basic-api", "user-management"],
      dataRetention: 30,
      customFields: {},
    },
    createdAt: new Date("2024-01-01"),
  },
  {
    id: "tenant-2",
    name: "TechCorp",
    domain: "tech.example.com",
    subscription: "premium",
    isActive: true,
    settings: {
      allowedOrigins: [
        "https://tech.example.com",
        "https://app.tech.example.com",
      ],
      features: [
        "basic-api",
        "user-management",
        "analytics",
        "advanced-reporting",
      ],
      dataRetention: 90,
      customFields: { theme: "dark", customLogo: true },
    },
    createdAt: new Date("2024-01-15"),
  },
  {
    id: "tenant-3",
    name: "BigCorp Enterprise",
    domain: "bigcorp.example.com",
    subscription: "enterprise",
    isActive: true,
    settings: {
      allowedOrigins: ["*"], // Enterprise gets wildcard
      features: [
        "basic-api",
        "user-management",
        "analytics",
        "advanced-reporting",
        "white-label",
        "custom-integrations",
      ],
      dataRetention: 365,
      customFields: {
        whiteLabel: true,
        customDomain: "api.bigcorp.com",
        ssoEnabled: true,
      },
    },
    createdAt: new Date("2023-12-01"),
  },
];

const users: User[] = [
  {
    id: "user-1",
    tenantId: "tenant-1",
    email: "admin@acme.example.com",
    name: "Acme Admin",
    role: "admin",
    permissions: ["users:read", "users:write", "billing:read"],
    isActive: true,
    createdAt: new Date("2024-01-01"),
  },
  {
    id: "user-2",
    tenantId: "tenant-2",
    email: "admin@tech.example.com",
    name: "Tech Admin",
    role: "admin",
    permissions: [
      "users:read",
      "users:write",
      "analytics:read",
      "billing:read",
    ],
    isActive: true,
    createdAt: new Date("2024-01-15"),
  },
  {
    id: "user-3",
    tenantId: "tenant-3",
    email: "owner@bigcorp.example.com",
    name: "BigCorp Owner",
    role: "owner",
    permissions: ["*"], // Enterprise owner gets all permissions
    isActive: true,
    createdAt: new Date("2023-12-01"),
  },
  {
    id: "user-4",
    tenantId: "tenant-2",
    email: "user@tech.example.com",
    name: "Tech User",
    role: "user",
    permissions: ["users:read"],
    isActive: true,
    createdAt: new Date("2024-02-01"),
  },
];

// Rate limit configurations per subscription tier
const rateLimitTiers: Record<string, RateLimitTier> = {
  free: {
    requestsPerHour: 100,
    burstLimit: 10,
    concurrent: 2,
  },
  premium: {
    requestsPerHour: 1000,
    burstLimit: 50,
    concurrent: 10,
  },
  enterprise: {
    requestsPerHour: 10000,
    burstLimit: 200,
    concurrent: 50,
  },
};

// API key to user/tenant mapping
const apiKeys: ApiKey[] = [
  {
    id: "key-1",
    tenantId: "tenant-1",
    userId: "user-1",
    key: "free_tenant_abc123",
    scopes: ["tenant:read", "users:read", "users:write"],
    rateLimit: rateLimitTiers.free!,
    createdAt: new Date("2024-01-01"),
    isActive: true,
  },
  {
    id: "key-2",
    tenantId: "tenant-2",
    userId: "user-2",
    key: "premium_tenant_def456",
    scopes: ["tenant:read", "users:*", "analytics:read"],
    rateLimit: rateLimitTiers.premium!,
    createdAt: new Date("2024-01-15"),
    isActive: true,
  },
  {
    id: "key-3",
    tenantId: "tenant-3",
    userId: "user-3",
    key: "enterprise_tenant_ghi789",
    scopes: ["*"], // Enterprise gets all scopes
    rateLimit: rateLimitTiers.enterprise!,
    createdAt: new Date("2023-12-01"),
    isActive: true,
  },
  {
    id: "key-4",
    tenantId: "tenant-2",
    userId: "user-4",
    key: "premium_user_jkl012",
    scopes: ["tenant:read", "users:read"],
    rateLimit: rateLimitTiers.premium!,
    createdAt: new Date("2024-02-01"),
    isActive: true,
  },
];

// Create lookup maps for performance
const apiKeyMap = new Map(apiKeys.map((key) => [key.key, key]));
const tenantMap = new Map(tenants.map((tenant) => [tenant.id, tenant]));
const userMap = new Map(users.map((user) => [user.id, user]));

// Extended context with tenant information
export interface TenantContext {
  tenant?: Tenant;
  user?: User;
  apiKey?: ApiKey;
}

// Helper functions
export function resolveApiKey(key: string): ApiKey | undefined {
  return apiKeyMap.get(key);
}

export function resolveTenant(tenantId: string): Tenant | undefined {
  return tenantMap.get(tenantId);
}

export function resolveUser(userId: string): User | undefined {
  return userMap.get(userId);
}

export function getTenantRateLimit(tenant: Tenant): RateLimitTier {
  return rateLimitTiers[tenant.subscription]!;
}

export function hasPermission(user: User, permission: string): boolean {
  if (user.permissions.includes("*")) {
    return true; // Owner/super-admin permissions
  }

  if (user.permissions.includes(permission)) {
    return true;
  }

  // Check wildcard permissions (e.g., "users:*" matches "users:read")
  const [resource, action] = permission.split(":");
  const wildcardPermission = `${resource}:*`;
  return user.permissions.includes(wildcardPermission);
}

export function checkTenantAccess(apiKey: ApiKey, tenantId: string): boolean {
  return apiKey.tenantId === tenantId;
}

// Main tenant authentication middleware
export const tenantAuth: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({
        error: "Missing or invalid authorization header",
        message: "Please provide API key as 'Authorization: Bearer <api-key>'",
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const apiKeyValue = authHeader.replace("Bearer ", "");
  const apiKey = resolveApiKey(apiKeyValue);

  if (!apiKey || !apiKey.isActive) {
    return new Response(
      JSON.stringify({
        error: "Invalid or inactive API key",
        message: "The provided API key is not valid or has been deactivated",
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Check API key expiration
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return new Response(
      JSON.stringify({
        error: "Expired API key",
        message: "The provided API key has expired",
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const tenant = resolveTenant(apiKey.tenantId);
  if (!tenant || !tenant.isActive) {
    return new Response(
      JSON.stringify({
        error: "Inactive tenant",
        message: "The tenant associated with this API key is inactive",
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const user = resolveUser(apiKey.userId);
  if (!user || !user.isActive) {
    return new Response(
      JSON.stringify({
        error: "Inactive user",
        message: "The user associated with this API key is inactive",
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Add tenant context to request
  (c as any).tenant = tenant;
  (c as any).user = user;
  (c as any).apiKey = apiKey;

  return next();
};

// Helper middleware to validate tenant ID in URL matches authenticated tenant
export const validateTenantId: MiddlewareHandler = async (c, next) => {
  const urlTenantId = c.params.tenantId;
  const apiKey = (c as any).apiKey as ApiKey;

  if (!urlTenantId) {
    return new Response(
      JSON.stringify({
        error: "Missing tenant ID",
        message: "Tenant ID is required in the URL path",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  if (!checkTenantAccess(apiKey, urlTenantId)) {
    return new Response(
      JSON.stringify({
        error: "Tenant access denied",
        message: "API key does not have access to this tenant",
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return next();
};

// Permission checking middleware factory
export function requirePermission(permission: string): MiddlewareHandler {
  return async (c, next) => {
    const user = (c as any).user as User;

    if (!hasPermission(user, permission)) {
      return new Response(
        JSON.stringify({
          error: "Insufficient permissions",
          message: `This operation requires permission: ${permission}`,
          required: permission,
          userPermissions: user.permissions,
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return next();
  };
}

// Subscription tier validation middleware factory
export function requireSubscription(
  ...tiers: Array<"free" | "premium" | "enterprise">
): MiddlewareHandler {
  return async (c, next) => {
    const tenant = (c as any).tenant as Tenant;

    if (!tiers.includes(tenant.subscription)) {
      return new Response(
        JSON.stringify({
          error: "Subscription tier insufficient",
          message: `This feature requires subscription tier: ${tiers.join(" or ")}`,
          currentTier: tenant.subscription,
          requiredTiers: tiers,
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return next();
  };
}

// Feature flag validation middleware factory
export function requireFeature(feature: string): MiddlewareHandler {
  return async (c, next) => {
    const tenant = (c as any).tenant as Tenant;

    if (!tenant.settings.features.includes(feature)) {
      return new Response(
        JSON.stringify({
          error: "Feature not available",
          message: `This feature '${feature}' is not available for your subscription`,
          feature,
          availableFeatures: tenant.settings.features,
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return next();
  };
}

export { tenants, users, apiKeys };
