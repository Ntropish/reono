// Test setup for Scenario 2: Multi-Tenant SaaS API Gateway

console.log("🧪 Setting up Scenario 2: Multi-Tenant SaaS API Gateway tests");

// Global test configuration
(globalThis as any).TEST_PORT = 8022;
(globalThis as any).TEST_BASE_URL =
  `http://localhost:${(globalThis as any).TEST_PORT}`;

// Test API keys for multi-tenant authentication
(globalThis as any).TEST_API_KEYS = {
  FREE: "free_tenant_abc123",
  PREMIUM: "premium_tenant_def456",
  ENTERPRISE: "enterprise_tenant_ghi789",
  INVALID: "invalid_key_999",
};

// Test tenant IDs
(globalThis as any).TEST_TENANTS = {
  FREE: "tenant-1",
  PREMIUM: "tenant-2",
  ENTERPRISE: "tenant-3",
  INVALID: "tenant-999",
};
