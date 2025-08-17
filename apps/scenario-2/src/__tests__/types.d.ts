// Global type declarations for Scenario 2 tests
declare global {
  var TEST_PORT: number;
  var TEST_BASE_URL: string;
  var TEST_API_KEYS: {
    FREE: string;
    PREMIUM: string;
    ENTERPRISE: string;
    INVALID: string;
  };
  var TEST_TENANTS: {
    FREE: string;
    PREMIUM: string;
    ENTERPRISE: string;
    INVALID: string;
  };
}

export {};
