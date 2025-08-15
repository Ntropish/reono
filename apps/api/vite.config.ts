/// <reference types="vitest" />
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    ssr: true,
    lib: {
      entry: "src/index.tsx",
      name: "bjsx-api",
      fileName: "index",
      formats: ["es", "cjs"],
    },
    outDir: "dist",
    rollupOptions: {
      external: [
        "path",
        "fs",
        "child_process",
        "util",
        "yargs/helpers",
        "yargs/yargs",
        "glob",
      ],
    },
  },
  resolve: {
    alias: {
      "@workspace/server": resolve(
        __dirname,
        "../../packages/server/src/index.ts"
      ),
      "@workspace/server/jsx-runtime": resolve(
        __dirname,
        "../../packages/server/src/jsx-runtime.ts"
      ),
      "@workspace/server/jsx-dev-runtime": resolve(
        __dirname,
        "../../packages/server/src/jsx-runtime.ts"
      ),
    },
  },
  plugins: [dts()],
  test: {},
});
