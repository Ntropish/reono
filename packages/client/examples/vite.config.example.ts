// Example of how a developer would set up their vite.config.ts
import { defineConfig } from "vite";
import { reonoClient } from "@reono/client/plugin";

export default defineConfig({
  plugins: [
    reonoClient({
      serverFile: "./src/api/server.tsx", // Your Reono API definition
      outputDir: "./src/generated", // Where to generate the client
      clientName: "api", // Name of the generated client
      baseUrl: "http://localhost:3000", // Default base URL
    }),
  ],
  // ... other vite config
});
