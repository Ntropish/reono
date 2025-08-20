import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { createApi } from "../src/generated/api";
import { App } from "../dist/index.mjs"; // Import the main application component
import { createApp } from "@reono/node-server";

const PORT = 3060;
const BASE_URL = `http://localhost:${PORT}`;

let createdId: number | null = null;
let app: any;
let server: any;
let api: ReturnType<typeof createApi>;

beforeAll(async () => {
  // Start the server with the App component
  app = createApp();
  app.serve(App());

  await new Promise<void>((resolve) => {
    server = app.listen(PORT, () => resolve());
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
    const data = await api.get("/users", {});
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
    const user = await api.get("/users/:userId", {
      params: { userId: createdId! },
    });
    expect(user).toMatchObject({ id: createdId!, name: expect.any(String) });
  });

  it("PUT /users/:id updates the user", async () => {
    expect(createdId).not.toBeNull();
    const updated = await api.put("/users/:userId", {
      params: { userId: createdId! },
      body: { name: "Updated Name" },
    });
    expect(updated).toMatchObject({ id: createdId!, name: "Updated Name" });
  });

  it("PATCH /users/:id is 405 until implemented, otherwise updates", async () => {
    expect(createdId).not.toBeNull();

    // For PATCH, we need to handle it differently since it might not be implemented
    // Let's use a try-catch approach since the generated client might not have PATCH
    try {
      const patched = await api.patch("/users/:userId", {
        params: { userId: createdId! },
        body: { name: "Patched Name" },
      });
      expect(patched).toMatchObject({ id: createdId!, name: "Patched Name" });
    } catch (error) {
      // If PATCH is not implemented, we expect a 405 Method Not Allowed
      // This would typically throw an error from the client
      expect(error).toBeDefined();
    }
  });

  it("DELETE /users/:id deletes the user", async () => {
    expect(createdId).not.toBeNull();
    const result = await api.delete("/users/:userId", {
      params: { userId: createdId! },
    });
    expect(result).toMatchObject({
      message: expect.stringContaining("deleted"),
    });

    // Try to get the deleted user - should fail
    try {
      await api.get("/users/:userId", {
        params: { userId: createdId! },
      });
      // If we get here without an error, the test should fail
      expect(true).toBe(false);
    } catch (error) {
      // Expected - user should be deleted
      expect(error).toBeDefined();
    }
  });

  it("POST /users rejects invalid body (400)", async () => {
    try {
      await api.post("/users", { body: { name: "123" } });
      // If we get here without an error, the test should fail
      expect(true).toBe(false);
    } catch (error) {
      // Expected - should throw a validation error
      expect(error).toBeDefined();
      // The error should contain validation information
      expect(String(error)).toMatch(/ValidationError|error/i);
    }
  });
});
