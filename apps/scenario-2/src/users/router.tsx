import { z } from "zod";
import {
  tenantAuth,
  validateTenantId,
  requirePermission,
  requireSubscription,
  users,
  type User,
  type Tenant,
  hasPermission,
} from "../middleware/auth";
import { tenantRateLimit } from "../middleware/rate-limit";

// Validation schemas for multi-tenant users
const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: z.enum(["user", "admin", "owner"]).default("user"),
  permissions: z.array(z.string()).default(["users:read"]),
});

const updateUserSchema = createUserSchema.partial();

const userParamsSchema = z.object({
  userId: z.string().uuid(),
});

const tenantParamsSchema = z.object({
  tenantId: z.string(),
});

// Route handlers for multi-tenant user management
const getAllUsers = (c: any) => {
  const user = c.user as User;
  const tenant = c.tenant as Tenant;

  // Filter users by tenant and apply permission-based filtering
  const tenantUsers = users.filter((u) => u.tenantId === tenant.id);

  // Users with admin permissions can see all tenant users
  if (hasPermission(user, "users:read") && user.role === "admin") {
    return c.json({
      users: tenantUsers.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        permissions: u.permissions,
        isActive: u.isActive,
        createdAt: u.createdAt,
      })),
      total: tenantUsers.length,
      tenant: tenant.name,
    });
  } else {
    // Regular users can only see themselves
    return c.json({
      users: [
        {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          permissions: user.permissions,
          isActive: user.isActive,
          createdAt: user.createdAt,
        },
      ],
      total: 1,
      tenant: tenant.name,
    });
  }
};

const getUser = (c: any) => {
  const user = c.user as User;
  const tenant = c.tenant as Tenant;
  const { userId } = c.params;

  // Users can only access their own data unless they have admin permissions
  if (
    !hasPermission(user, "users:read") ||
    (user.role !== "admin" && user.id !== userId)
  ) {
    return new Response(
      JSON.stringify({
        error: "Access denied",
        message: "You can only access your own user data",
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const targetUser = users.find(
    (u) => u.id === userId && u.tenantId === tenant.id
  );
  if (!targetUser) {
    return new Response(JSON.stringify({ error: "User not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return c.json({
    id: targetUser.id,
    email: targetUser.email,
    name: targetUser.name,
    role: targetUser.role,
    permissions: targetUser.permissions,
    isActive: targetUser.isActive,
    createdAt: targetUser.createdAt,
  });
};

const createUser = (c: any) => {
  const tenant = c.tenant as Tenant;

  const newUser: User = {
    id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    tenantId: tenant.id,
    isActive: true,
    createdAt: new Date(),
    ...c.body,
  };

  users.push(newUser);

  return c.json(
    {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      permissions: newUser.permissions,
      isActive: newUser.isActive,
      createdAt: newUser.createdAt,
    },
    201
  );
};

const updateUser = (c: any) => {
  const user = c.user as User;
  const tenant = c.tenant as Tenant;
  const { userId } = c.params;

  // Users can only update their own data unless they have admin permissions
  if (
    !hasPermission(user, "users:write") ||
    (user.role !== "admin" && user.id !== userId)
  ) {
    return new Response(
      JSON.stringify({
        error: "Access denied",
        message: "You can only update your own user data",
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const userIndex = users.findIndex(
    (u) => u.id === userId && u.tenantId === tenant.id
  );
  if (userIndex === -1) {
    return new Response(JSON.stringify({ error: "User not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const updatedUser = { ...users[userIndex], ...c.body };
  users[userIndex] = updatedUser;

  return c.json({
    id: updatedUser.id,
    email: updatedUser.email,
    name: updatedUser.name,
    role: updatedUser.role,
    permissions: updatedUser.permissions,
    isActive: updatedUser.isActive,
    createdAt: updatedUser.createdAt,
  });
};

const deleteUser = (c: any) => {
  const tenant = c.tenant as Tenant;
  const { userId } = c.params;

  const userIndex = users.findIndex(
    (u) => u.id === userId && u.tenantId === tenant.id
  );
  if (userIndex === -1) {
    return new Response(JSON.stringify({ error: "User not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  users.splice(userIndex, 1);
  return new Response(null, { status: 204 });
};

// Multi-tenant JSX Router Component
export const UserRouter = () => (
  <router path="tenant/:tenantId/users">
    <use handler={tenantAuth}>
      <use handler={validateTenantId}>
        <use handler={tenantRateLimit}>
          {/* List tenant users - requires users:read permission */}
          <use handler={requirePermission("users:read")}>
            <get path="" handler={getAllUsers} />
          </use>

          {/* Get specific user - requires users:read permission */}
          <use handler={requirePermission("users:read")}>
            <get
              path=":userId"
              validate={{
                params: z.object({
                  tenantId: z.string(),
                  userId: z.string(),
                }),
              }}
              handler={getUser}
            />
          </use>

          {/* Update user - requires users:write permission */}
          <use handler={requirePermission("users:write")}>
            <put
              path=":userId"
              validate={{
                params: z.object({
                  tenantId: z.string(),
                  userId: z.string(),
                }),
                body: updateUserSchema,
              }}
              handler={updateUser}
            />
          </use>

          {/* Admin-only operations - requires users:write permission + admin role */}
          <use handler={requirePermission("users:write")}>
            {/* Create new user */}
            <post
              path=""
              validate={{
                params: tenantParamsSchema,
                body: createUserSchema,
              }}
              handler={createUser}
            />

            {/* Delete user */}
            <delete
              path=":userId"
              validate={{
                params: z.object({
                  tenantId: z.string(),
                  userId: z.string(),
                }),
              }}
              handler={deleteUser}
            />
          </use>
        </use>
      </use>
    </use>
  </router>
);
