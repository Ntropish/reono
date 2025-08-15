/// <reference types="vitest" />
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

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
  plugins: [dts()],
  test: {},
});
