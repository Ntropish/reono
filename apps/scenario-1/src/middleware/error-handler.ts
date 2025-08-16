import { type MiddlewareHandler } from "reono";

export const errorHandler: MiddlewareHandler = async (c, next) => {
  try {
    return await next();
  } catch (error) {
    console.error('Unhandled error:', error);
    
    // Return a standardized error response
    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' 
          ? (error as Error).message 
          : 'Something went wrong',
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
};
