import type { Element, ApiContext, MiddlewareHandler } from "../components";
import { createElement } from "../jsx";

export type GuardCondition =
  | boolean
  | ((ctx: ApiContext) => boolean | Promise<boolean>);

export type GuardFallback =
  | Response
  | ((ctx: ApiContext) => Response | Promise<Response>);

export interface GuardProps {
  condition: GuardCondition;
  fallback?: GuardFallback;
  children?: Element | Element[];
}

/**
 * Guard component provides conditional access control middleware.
 *
 * @example
 * ```tsx
 * // Simple boolean condition
 * <Guard condition={true}>
 *   <get path="users" handler={getUsers} />
 * </Guard>
 *
 * // Function-based condition
 * <Guard condition={(c) => c.headers.get('x-api-version') === 'v2'}>
 *   <get path="users" handler={getUsersV2} />
 * </Guard>
 *
 * // With custom fallback
 * <Guard
 *   condition={(c) => c.state.get('user')?.role === 'admin'}
 *   fallback={(c) => c.json({ error: 'Admin required' }, 403)}
 * >
 *   <router path="admin">
 *     // Admin routes
 *   </router>
 * </Guard>
 * ```
 */
export function Guard({ condition, fallback, children }: GuardProps): Element {
  const guardMiddleware: MiddlewareHandler = async (ctx, next) => {
    const shouldAllow =
      typeof condition === "function" ? await condition(ctx) : condition;

    if (!shouldAllow) {
      if (fallback) {
        return typeof fallback === "function" ? await fallback(ctx) : fallback;
      }
      return new Response("Forbidden", { status: 403 });
    }

    return next();
  };

  return createElement("use", { handler: guardMiddleware }, children);
}
