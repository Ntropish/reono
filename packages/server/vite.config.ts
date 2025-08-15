/// <reference types="vitest" />
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "path";

export default defineConfig({
  build: {
    ssr: true,
    lib: {
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        "jsx-runtime": resolve(__dirname, "src/jsx-runtime.ts"),
      },
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
        "@zgdb/generate",
        "glob",
      ],
    },
  },
  plugins: [dts()],
  test: {},
});
