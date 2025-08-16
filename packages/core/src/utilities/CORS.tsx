import type { Element, ApiContext, MiddlewareHandler } from "../components";
import { createElement } from "../jsx";

export interface CORSProps {
  origins?: string[];
  methods?: string[];
  headers?: string[];
  credentials?: boolean;
  maxAge?: number;
  children?: Element | Element[];
}

/**
 * CORS component provides Cross-Origin Resource Sharing configuration.
 *
 * @example
 * ```tsx
 * // Basic CORS setup
 * <CORS origins={["http://localhost:3000"]} methods={["GET", "POST"]}>
 *   <router path="api">
 *     // API routes with CORS
 *   </router>
 * </CORS>
 *
 * // Full CORS configuration
 * <CORS
 *   origins={["https://example.com", "https://app.example.com"]}
 *   methods={["GET", "POST", "PUT", "DELETE"]}
 *   headers={["Content-Type", "Authorization"]}
 *   credentials={true}
 *   maxAge={86400}
 * >
 *   <router path="api">
 *     // Protected API routes
 *   </router>
 * </CORS>
 * ```
 */
export function CORS({
  origins = ["*"],
  methods = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  headers = ["Content-Type", "Authorization"],
  credentials = false,
  maxAge,
  children,
}: CORSProps): Element {
  const corsMiddleware: MiddlewareHandler = async (ctx, next) => {
    const origin = ctx.req.headers.get("origin");

    // Determine allowed origin
    const allowedOrigin = origins.includes("*")
      ? "*"
      : origin && origins.includes(origin)
        ? origin
        : origins[0] || "*";

    // Continue to next middleware/handler
    const response = await next();

    // Add CORS headers to actual responses
    if (response instanceof Response) {
      response.headers.set("Access-Control-Allow-Origin", allowedOrigin);

      if (credentials) {
        response.headers.set("Access-Control-Allow-Credentials", "true");
      }

      // Expose headers for simple requests
      if (headers.length > 0) {
        response.headers.set(
          "Access-Control-Expose-Headers",
          headers.join(", ")
        );
      }
    }

    return response;
  };

  // Create a preflight OPTIONS handler
  const preflightHandler = (ctx: ApiContext) => {
    const origin = ctx.req.headers.get("origin");
    const requestMethod = ctx.req.headers.get("access-control-request-method");
    
    // Only handle preflight requests (those with Access-Control-Request-Method header)
    if (!requestMethod) {
      // This is a regular OPTIONS request, not a preflight - return 405
      return new Response("Method Not Allowed", { status: 405 });
    }
    
    const allowedOrigin = origins.includes("*")
      ? "*"
      : origin && origins.includes(origin)
        ? origin
        : origins[0] || "*";

    const responseHeaders: Record<string, string> = {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": methods.join(", "),
      "Access-Control-Allow-Headers": headers.join(", "),
    };

    if (credentials) {
      responseHeaders["Access-Control-Allow-Credentials"] = "true";
    }

    if (maxAge !== undefined) {
      responseHeaders["Access-Control-Max-Age"] = maxAge.toString();
    }

    return new Response(null, {
      status: 204,
      headers: responseHeaders,
    });
  };

  // Recursively collect route paths and inject matching OPTIONS routes
  function injectOptionsRoutes(element: Element | Element[] | undefined): Element | Element[] {
    if (!element) return [];
    
    if (Array.isArray(element)) {
      const processedElements = element.map(e => injectOptionsRoutes(e) as Element);
      
      // Find all route paths in this array and add OPTIONS routes for them
      const routePaths = new Set<string>();
      for (const el of element) {
        if (el && typeof el === 'object' && 'type' in el) {
          if (['get', 'post', 'put', 'delete', 'patch', 'head'].includes(el.type)) {
            const routeElement = el as any;
            const path = routeElement.props?.path;
            if (path) {
              routePaths.add(typeof path === 'string' ? path : path.join('/'));
            }
          }
        }
      }
      
      // Add OPTIONS routes for each discovered path
      for (const path of routePaths) {
        processedElements.push(
          createElement("options", { path, handler: preflightHandler })
        );
      }
      
      return processedElements;
    }

    if (typeof element !== 'object' || !('type' in element)) {
      return element;
    }

    // If this is a router element, recursively process its children
    if (element.type === 'router') {
      const routerElement = element as any;
      const routerChildren = routerElement.props.children;
      const processedChildren = injectOptionsRoutes(routerChildren);
      
      return createElement('router', routerElement.props, processedChildren);
    }

    // For "use" elements, recursively process their children
    if (element.type === 'use') {
      const useElement = element as any;
      if (useElement.props?.children) {
        const processedChildren = injectOptionsRoutes(useElement.props.children);
        return {
          ...element,
          props: {
            ...useElement.props,
            children: processedChildren,
          },
        };
      }
    }

    return element;
  }

  const enhancedChildren = injectOptionsRoutes(children);

  // Wrap with CORS middleware
  return createElement("use", { handler: corsMiddleware }, enhancedChildren);
}
