// Debug script to examine what routes are being created
import { createApp } from "@reono/node-server";
import { UserRouter } from "./src/users/router.tsx";
import { ContentRouter } from "./src/content/router.tsx";
import { cors } from "./src/middleware/cors.ts";
import { logger } from "./src/middleware/logger.ts";
import { errorHandler } from "./src/middleware/error-handler.ts";

// Test application
const App = () => (
  <use handler={errorHandler}>
    <use handler={cors}>
      <use handler={logger}>
        <router path="api/v1">
          <get
            path="health"
            handler={(c) =>
              c.json({
                status: "ok",
                timestamp: Date.now(),
                version: "1.0.0",
              })
            }
          />
          <UserRouter />
          <ContentRouter />
        </router>
      </use>
    </use>
  </use>
);

// Create app and inspect internal structure
const app = createApp();
app.serve(<App />);

// This would help us see what's being generated internally
console.log("App created, inspecting structure...");
