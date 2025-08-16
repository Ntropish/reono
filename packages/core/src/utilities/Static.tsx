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

    // Simulate file system access (in real implementation, this would use fs)
    // For now, we'll return a placeholder response indicating static file handling
    try {
      // In a real implementation, this would:
      // 1. Resolve the full path: join(directory, filePath)
      // 2. Check if path is within directory bounds
      // 3. Read the file from filesystem
      // 4. Determine MIME type from extension
      // 5. Return Response with file content and proper headers

      return ctx.json({
        message: "Static file handler",
        path: filePath,
        directory,
        note: "In real implementation, this would serve the actual file",
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
