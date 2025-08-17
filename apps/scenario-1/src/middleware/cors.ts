import { type MiddlewareHandler } from "reono";

export const cors: MiddlewareHandler = async (c, next) => {
  // Handle preflight OPTIONS requests
  if (c.req.method === "OPTIONS") {
    const response = new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods":
          "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-Requested-With",
        "Access-Control-Max-Age": "86400", // 24 hours
        "Access-Control-Allow-Credentials": "true",
      },
    });
    c.res = response;
    return response;
  }

  // Process the request
  const response = await next();

  // Add CORS headers to the response
  if (response instanceof Response) {
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }

  return response;
};
