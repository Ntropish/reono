import { z } from "zod";

const users: Record<number, { id: number; name: string }> = {
  1: { id: 1, name: "Alice" },
  2: { id: 2, name: "Bob" },
};

let nextId = 3;

const userSchema = z.object({
  id: z.number(),
  name: z.string(),
});

export type User = z.infer<typeof userSchema>;

export const userInputSchema = userSchema.omit({ id: true });

export type UserInput = z.infer<typeof userInputSchema>;

export const updateUser = (id: number, data: UserInput) => {
  if (!users[id]) {
    throw new Error(`User with id ${id} not found`);
  }
  users[id] = { ...users[id], ...data };
  return users[id];
};

export const getUser = (id: number) => {
  const user = users[id];
  if (!user) {
    throw new Error(`User with id ${id} not found`);
  }
  return user;
};

export const getAllUsers = () => {
  console.log("Fetching all users", users);
  return Object.values(users);
};

export const deleteUser = (id: number) => {
  if (!users[id]) {
    throw new Error(`User with id ${id} not found`);
  }
  delete users[id];
  return { message: `User with id ${id} deleted` };
};

export const createUser = (input: UserInput) => {
  const newUser = { id: nextId++, ...input };
  users[newUser.id] = newUser;
  return newUser;
};
