import { z } from "zod";
import { authGuard, adminOnly, users, type User } from "../middleware/auth";
import { userBasedRateLimit } from "../middleware/rate-limit";

// Validation schemas
const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: z.enum(["user", "admin"]).default("user"),
  tier: z.enum(["free", "premium"]).default("free"),
});

const updateUserSchema = createUserSchema.partial();

const userParamsSchema = z.object({
  id: z.coerce.number(),
});

// Route handlers
const getAllUsers = (c: any) => {
  const user = c.user as User;

  // Regular users can only see themselves, admins see all
  if (user.role === "admin") {
    return c.json({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        tier: u.tier,
      })),
      total: users.length,
    });
  } else {
    return c.json({
      users: [
        {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tier: user.tier,
        },
      ],
      total: 1,
    });
  }
};

const getUser = (c: any) => {
  const user = c.user as User;
  const { id } = c.params;

  // Users can only access their own data unless they're admin
  if (user.role !== "admin" && user.id !== id) {
    return new Response(JSON.stringify({ error: "Access denied" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const targetUser = users.find((u) => u.id === id);
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
    tier: targetUser.tier,
  });
};

const createUser = (c: any) => {
  const newUser: User = {
    id: Math.max(...users.map((u) => u.id)) + 1,
    ...c.body,
  };

  users.push(newUser);

  return c.json(
    {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      tier: newUser.tier,
    },
    201
  );
};

const updateUser = (c: any) => {
  const user = c.user as User;
  const { id } = c.params;

  // Users can only update their own data unless they're admin
  if (user.role !== "admin" && user.id !== id) {
    return new Response(JSON.stringify({ error: "Access denied" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const userIndex = users.findIndex((u) => u.id === id);
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
    tier: updatedUser.tier,
  });
};

const deleteUser = (c: any) => {
  const { id } = c.params;

  const userIndex = users.findIndex((u) => u.id === id);
  if (userIndex === -1) {
    return new Response(JSON.stringify({ error: "User not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  users.splice(userIndex, 1);
  return new Response(null, { status: 204 });
};

// JSX Router Component
export const UserRouter = () => (
  <router path="users">
    <use handler={authGuard}>
      <use handler={userBasedRateLimit}>
        {/* Public user info endpoint (authenticated but not restricted) */}
        <get path="" handler={getAllUsers} />

        <get
          path=":id"
          validate={{ params: userParamsSchema }}
          handler={getUser}
        />

        <put
          path=":id"
          validate={{
            params: userParamsSchema,
            body: updateUserSchema,
          }}
          handler={updateUser}
        />

        {/* Admin-only operations */}
        <use handler={adminOnly}>
          <post
            path=""
            validate={{ body: createUserSchema }}
            handler={createUser}
          />

          <delete
            path=":id"
            validate={{ params: userParamsSchema }}
            handler={deleteUser}
          />
        </use>
      </use>
    </use>
  </router>
);
