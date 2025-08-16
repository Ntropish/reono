import { type MiddlewareHandler } from "reono";

// Simple in-memory user store for demo
export interface User {
  id: number;
  email: string;
  name: string;
  role: 'user' | 'admin';
  tier: 'free' | 'premium';
}

const users: User[] = [
  { id: 1, email: 'admin@example.com', name: 'Admin User', role: 'admin', tier: 'premium' },
  { id: 2, email: 'user@example.com', name: 'Regular User', role: 'user', tier: 'free' },
  { id: 3, email: 'premium@example.com', name: 'Premium User', role: 'user', tier: 'premium' },
];

// Simple API key to user mapping (in real app, use JWT or proper sessions)
const apiKeys = new Map([
  ['admin-key-123', users[0]],
  ['user-key-456', users[1]], 
  ['premium-key-789', users[2]],
]);

// Extend context with user information (simple approach for demo)
export interface AuthenticatedContext {
  user?: User;
}

export const authGuard: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Missing or invalid authorization header' }),
      { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
  
  const apiKey = authHeader.replace('Bearer ', '');
  const user = apiKeys.get(apiKey);
  
  if (!user) {
    return new Response(
      JSON.stringify({ error: 'Invalid API key' }),
      { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
  
  // Add user to context
  (c as any).user = user;
  
  return next();
};

export const adminOnly: MiddlewareHandler = async (c, next) => {
  const user = (c as any).user as User | undefined;
  
  if (!user || user.role !== 'admin') {
    return new Response(
      JSON.stringify({ error: 'Admin access required' }),
      { 
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
  
  return next();
};

export { users, apiKeys };
