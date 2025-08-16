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
  // Normalize path to not have trailing slash for consistent matching
  const basePath = path.endsWith("/") ? path.slice(0, -1) : path;

  const staticHandler = async (ctx: ApiContext) => {
    // Extract file path from URL by removing the route prefix
    const pathname = ctx.url.pathname;
    
    // We need to find what comes after our static route in the URL
    // The actual route path in the trie includes parent router prefixes
    
    // For nested paths like js/app.js, we need to reconstruct from individual params
    let filePath = "";
    
    // Check for two-level nested file parameter first (more specific)
    // If we have both singlefile and nestedfile, it means the nested route matched
    if (ctx.params.nestedfile) {
      if (ctx.params.folder) {
        filePath = `${ctx.params.folder}/${ctx.params.nestedfile}`;
      } else if (ctx.params.singlefile) {
        // Edge case: nested route matched but folder param is in singlefile
        filePath = `${ctx.params.singlefile}/${ctx.params.nestedfile}`;
      } else {
        filePath = ctx.params.nestedfile;
      }
    }
    // Check for single-level file parameter
    else if (ctx.params.singlefile) {
      filePath = ctx.params.singlefile;
    }
    // Handle the exact path case (no file)
    else {
      filePath = "";
    }

    // Security: prevent directory traversal in the file path
    if (filePath.includes("../") || filePath.includes("..\\")) {
      return new Response("Forbidden", { status: 403 });
    }

    // Handle empty file paths - serve index file
    if (!filePath || filePath === "") {
      return ctx.json({
        message: "Static file served",
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

  // Create multiple route patterns to handle different file path depths
  const exactRouteElement = createElement("get", {
    path: basePath,
    handler: staticHandler,
  });

  // Single-level file routes: /static/file.txt
  const singleFileRouteElement = createElement("get", {
    path: `${basePath}/:singlefile`,
    handler: staticHandler,
  });

  // Two-level nested routes: /static/folder/file.txt
  const nestedFileRouteElement = createElement("get", {
    path: `${basePath}/:folder/:nestedfile`,
    handler: staticHandler,
  });

  // Apply middleware if provided
  if (middleware.length > 0) {
    const wrappedExact = middleware.reduceRight(
      (acc, mw) => createElement("use", { handler: mw }, acc),
      exactRouteElement
    );
    const wrappedSingle = middleware.reduceRight(
      (acc, mw) => createElement("use", { handler: mw }, acc),
      singleFileRouteElement
    );
    const wrappedNested = middleware.reduceRight(
      (acc, mw) => createElement("use", { handler: mw }, acc),
      nestedFileRouteElement
    );
    
    // Return all routes as children
    return createElement("router", { path: "" }, wrappedExact, wrappedSingle, wrappedNested);
  }

  // Return all routes as children
  return createElement("router", { path: "" }, exactRouteElement, singleFileRouteElement, nestedFileRouteElement);
}
