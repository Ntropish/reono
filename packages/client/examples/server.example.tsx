// Example Reono API definition that would be analyzed
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: z.enum(['user', 'admin']).default('user'),
});

const CreateUserSchema = UserSchema.omit({ id: true });

// This is the JSX API definition that gets analyzed by the plugin
export const ApiServer = () => (
  <router path="api">
    <router path="v1">
      {/* Health check - no params, no body */}
      <get path="health" handler={(c) => c.json({ status: 'ok' })} />
      
      {/* Users endpoints */}
      <router path="users">
        {/* GET /api/v1/users - list users */}
        <get 
          path="" 
          handler={(c) => c.json({ users: [], total: 0 })} 
        />
        
        {/* POST /api/v1/users - create user */}
        <post 
          path="" 
          validate={{ body: CreateUserSchema }}
          handler={(c) => c.json(c.body, 201)} 
        />
        
        {/* GET /api/v1/users/:id - get user by id */}
        <get 
          path=":id" 
          validate={{ params: z.object({ id: z.string() }) }}
          handler={(c) => c.json({ id: c.params.id, name: 'John' })} 
        />
        
        {/* PUT /api/v1/users/:id - update user */}
        <put 
          path=":id" 
          validate={{ 
            params: z.object({ id: z.string() }),
            body: UserSchema.partial() 
          }}
          handler={(c) => c.json({ ...c.body, id: c.params.id })} 
        />
        
        {/* DELETE /api/v1/users/:id - delete user */}
        <delete 
          path=":id" 
          validate={{ params: z.object({ id: z.string() }) }}
          handler={(c) => new Response(null, { status: 204 })} 
        />
      </router>
      
      {/* Nested route with multiple params */}
      <router path="organizations">
        <router path=":orgId">
          <router path="users">
            {/* GET /api/v1/organizations/:orgId/users/:userId */}
            <get 
              path=":userId" 
              validate={{ 
                params: z.object({ 
                  orgId: z.string(), 
                  userId: z.string() 
                }) 
              }}
              handler={(c) => c.json({ 
                orgId: c.params.orgId, 
                userId: c.params.userId 
              })} 
            />
          </router>
        </router>
      </router>
    </router>
  </router>
);
