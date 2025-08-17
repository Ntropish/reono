export const createTEST_BASE_URL = (TEST_PORT: number) =>
  `http://localhost:${TEST_PORT}`;

// Test API keys for multi-tenant authentication
export const TEST_API_KEYS = {
  ADMIN: "admin-key-123",
  USER: "user-key-456",
  PREMIUM: "premium-key-789",
  INVALID: "invalid-key-999",
};

// Test tenant IDs
export const TEST_TENANTS = {
  FREE: "tenant-1",
  PREMIUM: "tenant-2",
  ENTERPRISE: "tenant-3",
  INVALID: "tenant-999",
};
