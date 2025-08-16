import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 10000,
    hookTimeout: 10000,
    setupFiles: ['./src/__tests__/setup.ts'],
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'reono',
  },
});
