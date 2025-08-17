import { createApp } from "@reono/node-server";
import { type MiddlewareHandler } from "reono";
import { z } from "zod";
import { UserRouter } from "./users/router";
import { ContentRouter } from "./content/router";
import { cors } from "./middleware/cors";
import { logger } from "./middleware/logger";
import { errorHandler } from "./middleware/error-handler";

const port = z.coerce.number().parse(process.env.PORT ?? 8081);

const App = () => {
  return (
    <use handler={errorHandler}>
      <use handler={cors}>
        <use handler={logger}>
          <router path="api/v1">
            {/* Health check endpoint */}
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

            {/* User management routes */}
            <UserRouter />

            {/* Content management routes with file uploads */}
            <ContentRouter />
          </router>
        </use>
      </use>
    </use>
  );
};

const app: any = createApp();
app.serve(<App />);

app.listen(port, () => {
  console.log(`🚀 Scenario 1: Content Management API`);
  console.log(`📍 Server running on http://localhost:${port}`);
  console.log(`🏥 Health check: http://localhost:${port}/api/v1/health`);
  console.log(`👥 Users API: http://localhost:${port}/api/v1/users`);
  console.log(`📝 Content API: http://localhost:${port}/api/v1/content`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down gracefully...");
  app.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});

export { app };
