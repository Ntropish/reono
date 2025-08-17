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
        plugin: resolve(__dirname, "src/plugin.ts"),
        runtime: resolve(__dirname, "src/runtime.ts"),
      },
      name: "@reono/client",
      fileName: (format, entryName) =>
        `${entryName}.${format === "es" ? "mjs" : "js"}`,
      formats: ["es", "cjs"],
    },
    outDir: "dist",
    rollupOptions: {
      external: ["vite", "path", "fs", "fs/promises", "reono", "typescript"],
    },
  },
  plugins: [dts()],
  test: {},
});
