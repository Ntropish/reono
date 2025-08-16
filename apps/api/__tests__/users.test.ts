import { describe, it, beforeAll, expect } from "vitest";
import { render, createElement } from "@reono/server";
import { logger } from "../src/logger";
import { z } from "zod";
import {
  getUser,
  updateUser,
  getAllUsers,
  deleteUser,
  createUser,
  userInputSchema,
} from "../src/routes/users/repo";

let handle: (req: Request) => Promise<Response>;

beforeAll(() => {
  // Build the in-memory listener using the same routes as the app (no TSX to avoid jsx-runtime resolution)
  const tree = createElement(
    "use",
    { handler: logger },
    createElement(
      "router",
      { path: "users" },
      createElement("get", {
        path: "",
        handler: (c: any) => c.json(getAllUsers()),
      }),
      createElement("get", {
        path: ":userId",
        validate: { params: z.object({ userId: z.coerce.number() }) },
        handler: (c: any) => c.json(getUser(c.params.userId)),
      }),
      createElement("put", {
        path: ":userId",
        validate: {
          body: userInputSchema,
          params: z.object({ userId: z.coerce.number() }),
        },
        handler: (c: any) => updateUser(c.params.userId, c.body),
      }),
      createElement("delete", {
        path: ":userId",
        validate: { params: z.object({ userId: z.coerce.number() }) },
        handler: (c: any) => deleteUser(c.params.userId),
      }),
      createElement("post", {
        path: "",
        validate: { body: userInputSchema },
        handler: (c: any) => createUser(c.body),
      })
    )
  );
  handle = render(tree as any);
});

async function call(method: string, path: string, body?: any) {
  const init: RequestInit = { method, headers: {} };
  if (body !== undefined) {
    (init.headers as Record<string, string>)["content-type"] =
      "application/json";
    (init as any).body = JSON.stringify(body);
  }
  const req = new Request(
    `http://localhost/${path.replace(/^\\\//, "")}`,
    init
  );
  return await handle(req);
}

describe("Users API", () => {
  it("GET /users returns initial users", async () => {
    const res = await call("GET", "/users");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/i);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    const ids = data.map((u: any) => u.id).sort();
    expect(ids).toContain(1);
    expect(ids).toContain(2);
  });

  it("GET /users/:id returns a single user", async () => {
    const res = await call("GET", "/users/1");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ id: 1, name: "Alice" });
  });

  it("POST /users creates a new user", async () => {
    const res = await call("POST", "/users", { name: "Charlie" });
    expect(res.status).toBe(200);
    const created = await res.json();
    expect(created).toMatchObject({ id: 3, name: "Charlie" });

    const check = await call("GET", "/users/3");
    expect(check.status).toBe(200);
    const user = await check.json();
    expect(user).toMatchObject({ id: 3, name: "Charlie" });
  });

  it("PUT /users/:id updates an existing user", async () => {
    const res = await call("PUT", "/users/3", { name: "Charles" });
    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated).toMatchObject({ id: 3, name: "Charles" });
  });

  it("DELETE /users/:id deletes a user", async () => {
    const res = await call("DELETE", "/users/3");
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload).toMatchObject({
      message: expect.stringContaining("deleted"),
    });

    const after = await call("GET", "/users/3");
    expect(after.status).toBe(500); // repo throws -> runtime returns 500 for now
  });

  it("PATCH /users/:id is not implemented yet (should 405)", async () => {
    const res = await call("PATCH", "/users/2", { name: "Bobby" });
    expect(res.status).toBe(405);
    const text = await res.text();
    expect(text).toMatch(/Method Not Allowed/i);
  });
});
