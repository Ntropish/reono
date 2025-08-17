// Test setup for Scenario 1 integration tests

console.log("🧪 Setting up Scenario 1 integration tests");

// Global test configuration
(globalThis as any).TEST_PORT = 8081;
(globalThis as any).TEST_BASE_URL =
  `http://localhost:${(globalThis as any).TEST_PORT}`;

// Test API keys for authentication
(globalThis as any).TEST_API_KEYS = {
  ADMIN: "admin-key-123",
  USER: "user-key-456",
  PREMIUM: "premium-key-789",
  INVALID: "invalid-key-999",
};
