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

${generateRouteTypesRecord(routes)}

${generateMethodSpecificPathTypes(routes)}

${generatePathParamTypes(routes)}

// Helper types to drive options/response from path
type ParamsOf<M extends keyof RouteDefinitions, P extends keyof RouteDefinitions[M]> =
  RouteDefinitions[M][P] extends { params: infer T } ? T : never;
type BodyOf<M extends keyof RouteDefinitions, P extends keyof RouteDefinitions[M]> =
  RouteDefinitions[M][P] extends { body: infer T } ? T : never;
export type ResponseFor<M extends keyof RouteDefinitions, P extends keyof RouteDefinitions[M]> =
  RouteDefinitions[M][P] extends { response: infer R } ? R : never;
type MaybeParams<M extends keyof RouteDefinitions, P extends keyof RouteDefinitions[M]> =
  [ParamsOf<M, P>] extends [never] ? {} : { params: ParamsOf<M, P> };
type MaybeBody<M extends keyof RouteDefinitions, P extends keyof RouteDefinitions[M]> =
  [BodyOf<M, P>] extends [never] ? {} : { body: BodyOf<M, P> };
export type OptionsFor<M extends keyof RouteDefinitions, P extends keyof RouteDefinitions[M]> =
  Omit<ClientRequestOptions, 'params' | 'body'> & MaybeParams<M, P> & MaybeBody<M, P>;
type HasParams<M extends keyof RouteDefinitions, P extends keyof RouteDefinitions[M]> =
  [ParamsOf<M, P>] extends [never] ? false : true;
type HasBody<M extends keyof RouteDefinitions, P extends keyof RouteDefinitions[M]> =
  [BodyOf<M, P>] extends [never] ? false : true;
type RequiresOptions<M extends keyof RouteDefinitions, P extends keyof RouteDefinitions[M]> =
  HasParams<M, P> extends true ? true : HasBody<M, P> extends true ? true : false;

// Generated client interface
export interface GeneratedApiClient {
${routeMethods}
}

// Create the typed client
function createTypedClient(options: CreateClientOptions = {}): GeneratedApiClient {
  const client = createClient({ baseUrl: '${baseUrl}', ...options });

${Array.from(methodGroups.entries())
  .map(([method, methodRoutes]) => generateMethodImplementation(method, methodRoutes))
  .join("\n\n")}

  return {
${Array.from(methodGroups.keys())
  .map((method) => (method === "delete" ? "    delete: del" : `    ${method}`))
  .join(",\n")}
  } as GeneratedApiClient;
}

// Export the client instance
export const ${clientName} = createTypedClient();

// Export the client factory for custom configuration
export { createTypedClient as create${clientName.charAt(0).toUpperCase() + clientName.slice(1)} };
`;
  }

  function generateMethodSpecificPathTypes(routes: RouteInfo[]): string {
    // Group routes by HTTP method
    const methodGroups = new Map<string, RouteInfo[]>();
    routes.forEach((route) => {
      const method = route.method.toUpperCase();
      if (!methodGroups.has(method)) {
        methodGroups.set(method, []);
      }
      methodGroups.get(method)!.push(route);
    });

    const methodPathTypes = Array.from(methodGroups.entries())
      .map(([method, methodRoutes]) => {
        const paths = methodRoutes.map((r) => `'${r.path}'`).join(" | ");
        return `export type ${method}Paths = ${paths || "never"};`;
      })
      .join("\n");

    const allPaths = routes.map((r) => `'${r.path}'`).join(" | ") || "never";

    return `// Method-specific path types
${methodPathTypes}

// Union type of all valid paths
export type ValidPaths = ${allPaths};`;
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
    const methodUpper = method.toUpperCase();
    const pathsType = `${methodUpper}Paths`;
    return `  ${method}<TPath extends ${pathsType}>(...args: RequiresOptions<'${methodUpper}', TPath> extends true
    ? [path: TPath, options: OptionsFor<'${methodUpper}', TPath>]
    : [path: TPath, options?: Omit<ClientRequestOptions, 'params' | 'body'>]
  ): Promise<ResponseFor<'${methodUpper}', TPath>>;`;
  }

  function generateMethodImplementation(
    method: string,
    routes: RouteInfo[]
  ): string {
  const implementations = routes
      .map((route) => {
        const methodUpper = method.toUpperCase();
    return `      case '${route.path}': return client.${method}(path, options) as Promise<ResponseFor<'${methodUpper}', '${route.path}'>>;`;
      })
      .join("\n");

    const varName = method === "delete" ? "del" : method;
    const methodUpper = method.toUpperCase();

  return `  const ${varName}: GeneratedApiClient["${method}"] = ((...args: any[]) => {
      const [path, options] = args as [any, any];
      switch (path) {
${implementations}
        default: throw new Error(\`Invalid path for ${methodUpper}: \${path}\`);
      }
    }) as any;`;
  }

  function inferResponseType(route: RouteInfo): string {
    // Common response patterns based on the route
    if (route.path.includes("/health")) {
      return `{ status: string; timestamp: number; version: string; service?: string }`;
    }

    if (route.path.includes("/users") && route.method === "GET") {
      if (route.path.includes(":")) {
        // Single user
        return `{ id: number; name: string; [key: string]: any }`;
      } else {
        // User list - returns array directly, not wrapped in object
        return `Array<{ id: number; name: string; [key: string]: any }>`;
      }
    }

    if (route.method === "POST" && route.path.includes("/users")) {
      return `{ id: number; name: string; [key: string]: any }`;
    }

    if (route.path.includes("/tenant") && route.path.includes("/info")) {
      return `{ id: string; name: string; domain: string; subscription: string; [key: string]: any }`;
    }

    // Default fallback
    return "any";
  }

  function generateRouteTypesRecord(routes: RouteInfo[]): string {
    // Group routes by HTTP method
    const methodGroups = new Map<string, RouteInfo[]>();
    routes.forEach((route) => {
      const method = route.method.toUpperCase();
      if (!methodGroups.has(method)) {
        methodGroups.set(method, []);
      }
      methodGroups.get(method)!.push(route);
    });

    // Generate method-specific interfaces
    const methodInterfaces = Array.from(methodGroups.entries())
      .map(([method, methodRoutes]) => {
        const routeEntries = methodRoutes
          .map((route) => {
            const paramType =
              route.params.length > 0
                ? `{ ${route.params.map((p) => `${p}: string | number`).join("; ")} }`
                : "never";

            const bodyType = route.hasBody
              ? route.validation?.body || "any"
              : "never";

            const responseType = route.responseType || inferResponseType(route);

            return `    "${route.path}": {
      params: ${paramType};
      body: ${bodyType};
      response: ${responseType};
    }`;
          })
          .join(",\n");

        return `  ${method}: {
${routeEntries}
  }`;
      })
      .join(",\n");

    return `// Route type definitions grouped by HTTP method
export interface RouteDefinitions {
${methodInterfaces}
}`;
  }
}
