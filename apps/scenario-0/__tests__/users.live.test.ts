import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { createApi } from "@/src/generated/api";
import { App } from "@/dist/index.mjs"; // Import the main application component
import { createApp } from "@reono/node-server";

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3050";

let createdId: number | null = null;
let app: any;
let server: any;
let api: ReturnType<typeof createApi>;

beforeAll(async () => {
  // Start the server with the App component
  app = createApp();
  app.serve(App());

  await new Promise<void>((resolve) => {
    server = app.listen(3050, () => resolve());
  });

  // Create the type-safe client
  api = createApi({ baseUrl: BASE_URL });
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
});

describe("Users API (live)", () => {
  it("GET /users returns a list", async () => {
    const data = await api.get("/users");
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it("POST /users creates a new user", async () => {
    const name = `TestUser-${Date.now()}`;
    const created = await api.post("/users", { body: { name } });
    expect(created).toMatchObject({ name });
    expect(typeof created.id).toBe("number");
    createdId = created.id;
  });

  it("GET /users/:id returns the created user", async () => {
    expect(createdId).not.toBeNull();
    const res = await request("GET", `/users/${createdId}`);
    expect(res.status).toBe(200);
    const user = await res.json();
    expect(user).toMatchObject({ id: createdId!, name: expect.any(String) });
  });

  it("PUT /users/:id updates the user", async () => {
    expect(createdId).not.toBeNull();
    const res = await request("PUT", `/users/${createdId}`, {
      name: "Updated Name",
    });
    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated).toMatchObject({ id: createdId!, name: "Updated Name" });
  });

  it("PATCH /users/:id is 405 until implemented, otherwise updates", async () => {
    expect(createdId).not.toBeNull();
    const res = await request("PATCH", `/users/${createdId}`, {
      name: "Patched Name",
    });
    if (res.status === 405) {
      const text = await res.text();
      expect(text).toMatch(/Method Not Allowed/i);
    } else {
      expect(res.status).toBe(200);
      const patched = await res.json();
      expect(patched).toMatchObject({ id: createdId!, name: "Patched Name" });
    }
  });

  it("DELETE /users/:id deletes the user", async () => {
    expect(createdId).not.toBeNull();
    const res = await request("DELETE", `/users/${createdId}`);
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload).toMatchObject({
      message: expect.stringContaining("deleted"),
    });

    const after = await request("GET", `/users/${createdId}`);
    // Current behavior: repo throws -> runtime returns 500
    expect(after.status).toBe(500);
  });

  it("POST /users rejects invalid body (400)", async () => {
    const res = await request("POST", "/users", { name: 123 });
    expect(res.status).toBe(400);
    const body = await res
      .json()
      .catch(async () => ({ text: await res.text() }));
    // Should contain validation error info
    expect(JSON.stringify(body)).toMatch(/ValidationError|error/i);
  });
});
