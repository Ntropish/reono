/// <reference types="vitest" />
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { reonoClient } from "@reono/client";

export default defineConfig({
  build: {
    ssr: true,
    lib: {
      entry: "src/index.tsx",
      name: "@reono/scenario-1",
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
  plugins: [
    dts(),
    reonoClient({
      serverFile: "./src/index.tsx",
      outputDir: "./src/generated",
      clientName: "api",
      baseUrl: "http://localhost:8200", // Use correct port
    }),
  ],
  test: {},
});
