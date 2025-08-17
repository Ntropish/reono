// Global test configuration
export const createTEST_BASE_URL = (TEST_PORT: number) =>
  `http://localhost:${TEST_PORT}`;

// Test API keys for multi-tenant authentication
export const TEST_API_KEYS = {
  FREE: "free_tenant_abc123",
  PREMIUM: "premium_tenant_def456",
  ENTERPRISE: "enterprise_tenant_ghi789",
  INVALID: "invalid_key_999",
};

// Test tenant IDs
export const TEST_TENANTS = {
  FREE: "tenant-1",
  PREMIUM: "tenant-2",
  ENTERPRISE: "tenant-3",
  INVALID: "tenant-999",
};
