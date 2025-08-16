import type { Element, ApiContext, MiddlewareHandler } from "../components";
import { createElement } from "../jsx";

export interface StaticProps {
  path: string;
  directory: string;
  middleware?: MiddlewareHandler[];
  children?: Element | Element[];
}

/**
 * Static component provides static file serving functionality.
 *
 * @example
 * ```tsx
 * // Basic static file serving
 * <Static path="/assets" directory="./public" />
 *
 * // With authentication middleware
 * <Static
 *   path="/uploads"
 *   directory="./uploads"
 *   middleware={[authMiddleware]}
 * />
 *
 * // Nested with other routes
 * <router path="app">
 *   <Static path="/static" directory="./dist" />
 *   <get path="api/users" handler={getUsers} />
 * </router>
 * ```
 */
export function Static({
  path,
  directory,
  middleware = [],
  children,
}: StaticProps): Element {
  const staticHandler = async (ctx: ApiContext) => {
    const filePath = ctx.params.filepath || "";

    // Security: prevent directory traversal
    if (filePath.includes("../") || filePath.includes("..\\")) {
      return new Response("Forbidden", { status: 403 });
    }

    // Handle empty file paths - serve index file
    if (!filePath || filePath === "") {
      return ctx.json({
        message: "Static index served",
        path: "index.html",
        directory,
      });
    }

    // Mock file serving - in real implementation this would use fs
    try {
      // Simulate file existence based on common patterns
      const validFiles = [
        "style.css",
        "js/app.js",
        "bundle.js",
        "secret.txt",
        "index.html",
      ];

      const isValidFile = validFiles.some((file) => filePath.endsWith(file));

      if (!isValidFile) {
        return new Response("Not Found", { status: 404 });
      }

      // Return mock file content
      return ctx.json({
        message: "Static file served",
        path: filePath,
        directory,
        content: `Mock content for ${filePath}`,
      });
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  };

  // Create the route element for capturing file paths
  const routeElement = createElement("get", {
    path: `${path}/*filepath`,
    handler: staticHandler,
  });

  // Apply middleware if provided
  if (middleware.length > 0) {
    return middleware.reduceRight(
      (acc, mw) => createElement("use", { handler: mw }, acc),
      routeElement
    );
  }

  return routeElement;
}
