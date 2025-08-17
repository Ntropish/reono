import type { Plugin } from "vite";
import { readFile, writeFile, mkdir } from "fs/promises";
import { resolve, dirname, relative } from "path";
import { existsSync } from "fs";
import {
  ReonoASTParser,
  type RouteInfo as ASTRouteInfo,
} from "./ast-parser.js";

export interface ReonoClientOptions {
  /**
   * Path to the JSX file containing your Reono API definition
   * @example './src/api/server.tsx'
   */
  serverFile: string;

  /**
   * Directory where the generated client will be written
   * @default './src/generated'
   */
  outputDir?: string;

  /**
   * Name of the generated client
   * @default 'api'
   */
  clientName?: string;

  /**
   * Base URL for the API (can be overridden at runtime)
   * @default ''
   */
  baseUrl?: string;

  /**
   * Whether to watch the server file for changes in dev mode
   * @default true
   */
  watch?: boolean;
}

interface RouteInfo {
  method: string;
  path: string;
  params: string[];
  hasBody: boolean;
  bodyType?: string;
  responseType?: string;
  validation?: {
    params?: string;
    body?: string;
    query?: string;
  };
}

export function reonoClient(options: ReonoClientOptions): Plugin {
  const {
    serverFile,
    outputDir = "./src/generated",
    clientName = "api",
    baseUrl = "",
    watch = true,
  } = options;

  let root: string;

  // Define the generateClient function outside the plugin object
  async function generateClient() {
    try {
      const serverFilePath = resolve(root, serverFile);
      const outputDirPath = resolve(root, outputDir);

      if (!existsSync(serverFilePath)) {
        console.warn(`[reono-client] Server file not found: ${serverFile}`);
        return;
      }

      // Analyze the JSX file
      const routes = await analyzeServerFile(serverFilePath);
      console.log(
        `[reono-client] Plugin received ${routes.length} routes from parser`
      );
      routes.forEach((route, i) => {
        console.log(`  [${i + 1}] ${route.method} ${route.path}`);
      });

      // Generate the client code
      const clientCode = generateClientCode(routes, clientName, baseUrl);

      // Ensure output directory exists
      await mkdir(outputDirPath, { recursive: true });

      // Write the client file
      const clientFilePath = resolve(outputDirPath, `${clientName}.ts`);
      await writeFile(clientFilePath, clientCode, "utf-8");

      console.log(
        `[reono-client] Generated client: ${relative(root, clientFilePath)}`
      );
    } catch (error) {
      console.error("[reono-client] Failed to generate client:", error);
    }
  }

  return {
    name: "reono-client",

    configResolved(config: any) {
      root = config.root;
    },

    async buildStart() {
      await generateClient();
    },

    configureServer(server: any) {
      if (watch) {
        const serverFilePath = resolve(root, serverFile);
        server.watcher.add(serverFilePath);

        server.watcher.on("change", (file: string) => {
          if (file === serverFilePath) {
            generateClient();
          }
        });
      }
    },
  };

  async function analyzeServerFile(filePath: string): Promise<RouteInfo[]> {
    const parser = new ReonoASTParser();
    const astRoutes = await parser.parseServerFile(filePath);

    console.log(
      `[reono-client] Plugin analyzeServerFile: Got ${astRoutes.length} routes from AST parser`
    );

    // Convert AST routes to plugin RouteInfo format
    const convertedRoutes = astRoutes.map(
      (astRoute): RouteInfo => ({
        method: astRoute.method,
        path: astRoute.path,
        params: astRoute.params,
        hasBody: astRoute.hasBody,
        bodyType: astRoute.bodyType,
        responseType: astRoute.responseType,
        validation: astRoute.validation,
      })
    );

    console.log(
      `[reono-client] Plugin analyzeServerFile: Converted to ${convertedRoutes.length} routes`
    );

    // Deduplicate routes based on method + path combination
    const routeMap = new Map<string, RouteInfo>();
    convertedRoutes.forEach((route) => {
      const key = `${route.method} ${route.path}`;
      if (!routeMap.has(key)) {
        routeMap.set(key, route);
      }
    });

    const deduplicatedRoutes = Array.from(routeMap.values());
    console.log(
      `[reono-client] Plugin analyzeServerFile: Deduplicated from ${convertedRoutes.length} to ${deduplicatedRoutes.length} routes`
    );
    return deduplicatedRoutes;
  }

  function generateClientCode(
    routes: RouteInfo[],
    clientName: string,
    baseUrl: string
  ): string {
    // Group routes by method to generate proper interface
    const methodGroups = new Map<string, RouteInfo[]>();
    routes.forEach((route) => {
      const method = route.method.toLowerCase();
      if (!methodGroups.has(method)) {
        methodGroups.set(method, []);
      }
      methodGroups.get(method)!.push(route);
    });

    const routeMethods = Array.from(methodGroups.entries())
      .map(([method, methodRoutes]) =>
        generateMethodOverloads(method, methodRoutes)
      )
      .join("\n");

    return `// Generated by @reono/client - DO NOT EDIT
import { createClient, type ClientRequestOptions, type CreateClientOptions } from '@reono/client/runtime';

// Route type definitions stored in a record to handle special characters
${generateRouteTypesRecord(routes)}

// Union type of all valid paths
export type ValidPaths = ${routes.map((r) => `'${r.path}'`).join(" | ") || "never"};

// Path-specific parameter requirements
${generatePathParamTypes(routes)}

// Generated client interface
export interface GeneratedApiClient {
${routeMethods}
}

// Create the typed client
function createTypedClient(options: CreateClientOptions = {}): GeneratedApiClient {
  const client = createClient({ baseUrl: '${baseUrl}', ...options });
  
  return {
${Array.from(methodGroups.entries())
  .map(([method, methodRoutes]) =>
    generateMethodImplementation(method, methodRoutes)
  )
  .join(",\n")}
  };
}

// Export the client instance
export const ${clientName} = createTypedClient();

// Export the client factory for custom configuration
export { createTypedClient as create${clientName.charAt(0).toUpperCase() + clientName.slice(1)} };
`;
  }

  function generatePathParamTypes(routes: RouteInfo[]): string {
    // Deduplicate paths by using a Map to store unique path entries
    const pathMap = new Map<string, RouteInfo>();
    routes
      .filter((route) => route.params.length > 0)
      .forEach((route) => {
        if (!pathMap.has(route.path)) {
          pathMap.set(route.path, route);
        }
      });

    const pathTypes = Array.from(pathMap.values())
      .map(
        (route) =>
          `  '${route.path}': { ${route.params.map((p) => `${p}: string | number`).join("; ")} }`
      )
      .join(";\n");

    return `export type PathParams<T extends ValidPaths> = T extends keyof PathParamMap 
  ? PathParamMap[T] 
  : never;

interface PathParamMap {
${pathTypes || "  // No paths with parameters"}
}`;
  }

  function generateMethodOverloads(
    method: string,
    routes: RouteInfo[]
  ): string {
    const overloads = routes.map((route) => {
      const routeKey = `"${method.toUpperCase()} ${route.path}"`;
      const paramType =
        route.params.length > 0
          ? `ClientRequestOptions & { params: RouteDefinitions[${routeKey}]["params"] }`
          : "ClientRequestOptions";

      const bodyConstraint = route.hasBody
        ? ` & { body: RouteDefinitions[${routeKey}]["body"] }`
        : "";

      const optionsType =
        route.params.length > 0 || route.hasBody
          ? `${paramType}${bodyConstraint}`
          : "ClientRequestOptions";

      const isOptional = route.params.length === 0 && !route.hasBody ? "?" : "";

      return `  ${method}(path: '${route.path}', options${isOptional}: ${optionsType}): Promise<RouteDefinitions[${routeKey}]["response"]>;`;
    });

    return overloads.join("\n");
  }

  function generateMethodImplementation(
    method: string,
    routes: RouteInfo[]
  ): string {
    const implementations = routes
      .map((route) => {
        const routeKey = `"${route.method} ${route.path}"`;
        return `      case '${route.path}': return client.${method}(path, options) as Promise<RouteDefinitions[${routeKey}]["response"]>;`;
      })
      .join("\n");

    return `    ${method}: (path: string, options?: ClientRequestOptions) => {
      switch (path) {
${implementations}
        default: throw new Error(\`Invalid path for ${method.toUpperCase()}: \${path}\`);
      }
    }`;
  }

  function inferResponseType(route: RouteInfo): string {
    // Common response patterns based on the route
    if (route.path.includes("/health")) {
      return `{ status: string; timestamp: number; version: string; service?: string }`;
    }

    if (route.path.includes("/users") && route.method === "GET") {
      if (route.path.includes(":")) {
        // Single user
        return `{ id: string; email: string; name: string; role: string; [key: string]: any }`;
      } else {
        // User list
        return `{ users: Array<{ id: string; email: string; name: string; role: string; [key: string]: any }> }`;
      }
    }

    if (route.method === "POST" && route.path.includes("/users")) {
      return `{ id: string; email: string; name: string; role: string; [key: string]: any }`;
    }

    if (route.path.includes("/tenant") && route.path.includes("/info")) {
      return `{ id: string; name: string; domain: string; subscription: string; [key: string]: any }`;
    }

    // Default fallback
    return "any";
  }

  function generateRouteTypesRecord(routes: RouteInfo[]): string {
    const routeEntries = routes
      .map((route) => {
        const paramType =
          route.params.length > 0
            ? `{ ${route.params.map((p) => `${p}: string | number`).join("; ")} }`
            : "never";

        const bodyType = route.hasBody
          ? route.validation?.body || "any"
          : "never";

        // For response types, we could extract from handler return types
        // For now, using a more specific type based on common patterns
        const responseType = route.responseType || inferResponseType(route);

        const routeKey = `"${route.method} ${route.path}"`;
        return `  ${routeKey}: {
    params: ${paramType};
    body: ${bodyType};
    response: ${responseType};
  }`;
      })
      .join(",\n");

    return `// Route type definitions
export interface RouteDefinitions {
${routeEntries}
}`;
  }
}
