import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { App } from "../dist/index.mjs"; // Import the main application component

// const BASE_URL = process.env.API_BASE_URL || "http://localhost:3050";

// async function waitForServer(path = "/users", timeoutMs = 10000) {
//   const start = Date.now();
//   let lastErr: any;
//   while (Date.now() - start < timeoutMs) {
//     try {
//       const res = await fetch(`${BASE_URL}${path}`);
//       if (res.ok || res.status === 405) return; // endpoint available
//     } catch (e) {
//       lastErr = e;
//     }
//     await new Promise((r) => setTimeout(r, 200));
//   }
//   throw new Error(
//     `Server at ${BASE_URL} did not become ready within ${timeoutMs}ms. Last error: ${lastErr}`
//   );
// }

// async function request(method: string, path: string, body?: any) {
//   const headers: Record<string, string> = {};
//   let payload: BodyInit | undefined = undefined;
//   if (body !== undefined) {
//     headers["content-type"] = "application/json";
//     payload = JSON.stringify(body);
//   }
//   const res = await fetch(`${BASE_URL}${path}`, {
//     method,
//     headers,
//     body: payload,
//   });
//   return res;
// }

let createdId: number | null = null;

beforeAll(async () => {
  // await waitForServer("/users");
});

  let app: any;
  let server: any;
  let api: ReturnType<typeof createApi>;

  beforeAll(async () => {
    // Start test server
    app = createApp();
    app.serve(<App />);

    await new Promise<void>((resolve) => {
      server = app.listen(TEST_PORT, () => resolve());
    });

    const TEST_BASE_URL = createTEST_BASE_URL(TEST_PORT);

    // Create the type-safe generated client
    api = createApi({ baseUrl: TEST_BASE_URL });
  });

describe("Users API (live)", () => {
  it("GET /users returns a list", async () => {
    const res = await request("GET", "/users");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") || "").toMatch(/application\/json/i);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it("POST /users creates a new user", async () => {
    const name = `TestUser-${Date.now()}`;
    const res = await request("POST", "/users", { name });
    expect(res.status).toBe(200);
    const created = await res.json();
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
