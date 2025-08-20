import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { createClient } from "@reono/client/runtime";
import { App } from "../dist/index.mjs"; // Built server element
import { createApp } from "@reono/node-server";

const PORT = 3061; // Use a separate port from other live tests
const BASE_URL = `http://localhost:${PORT}`;

let app: any;
let server: any;
let api: ReturnType<typeof createClient>;

beforeAll(async () => {
  app = createApp();
  app.serve(App());

  await new Promise<void>((resolve) => {
    server = app.listen(PORT, () => resolve());
  });

  api = createClient({ baseUrl: BASE_URL });
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
});

function expectProblemJSONHeaders(err: any) {
  expect(err).toBeDefined();
  expect(err.response).toBeDefined();
  const ct = err.response.headers.get("content-type") || "";
  expect(ct).toMatch(/application\/problem\+json/i);
}

function expectStatus(err: any, status: number) {
  expect(err.status).toBe(status);
}

describe("Errors API (live)", () => {
  it("GET /errors/bad-request -> 400 Problem Details", async () => {
    try {
      await api.get("/errors/bad-request", {});
      expect(true).toBe(false);
    } catch (err: any) {
      expectProblemJSONHeaders(err);
      expectStatus(err, 400);
      // Title/type are public fields if provided
      if (err.title) expect(typeof err.title).toBe("string");
      if (err.type) expect(typeof err.type).toBe("string");
    }
  });

  it("GET /errors/unauthorized -> 401 with WWW-Authenticate", async () => {
    try {
      await api.get("/errors/unauthorized", {});
      expect(true).toBe(false);
    } catch (err: any) {
      expectProblemJSONHeaders(err);
      expectStatus(err, 401);
      const hdr = err.response.headers.get("www-authenticate");
      expect(hdr || "").not.toBe("");
    }
  });

  it("GET /errors/forbidden -> 403", async () => {
    try {
      await api.get("/errors/forbidden", {});
      expect(true).toBe(false);
    } catch (err: any) {
      expectProblemJSONHeaders(err);
      expectStatus(err, 403);
    }
  });

  it("GET /errors/not-found -> 404", async () => {
    try {
      await api.get("/errors/not-found", {});
      expect(true).toBe(false);
    } catch (err: any) {
      expectProblemJSONHeaders(err);
      expectStatus(err, 404);
    }
  });

  it("GET /errors/conflict -> 409", async () => {
    try {
      await api.get("/errors/conflict", {});
      expect(true).toBe(false);
    } catch (err: any) {
      expectProblemJSONHeaders(err);
      expectStatus(err, 409);
    }
  });

  it("GET /errors/unprocessable -> 422", async () => {
    try {
      await api.get("/errors/unprocessable", {});
      expect(true).toBe(false);
    } catch (err: any) {
      expectProblemJSONHeaders(err);
      expectStatus(err, 422);
    }
  });

  it("GET /errors/too-many-requests -> 429 with Retry-After", async () => {
    try {
      await api.get("/errors/too-many-requests", {});
      expect(true).toBe(false);
    } catch (err: any) {
      expectProblemJSONHeaders(err);
      expectStatus(err, 429);
      const ra = err.response.headers.get("retry-after");
      expect(ra || "").not.toBe("");
    }
  });

  it("GET /errors/internal -> 500", async () => {
    try {
      await api.get("/errors/internal", {});
      expect(true).toBe(false);
    } catch (err: any) {
      expectProblemJSONHeaders(err);
      expectStatus(err, 500);
      // Should not leak internals; title may be generic
      // detail is optional and should be safe if present
    }
  });

  it("GET /errors/custom -> 418 with custom headers and JSON body", async () => {
    try {
      await api.get("/errors/custom", {});
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err).toBeDefined();
      expectStatus(err, 418);
      const ct = err.response.headers.get("content-type") || "";
      expect(ct).toMatch(/application\/json/i);
      const x = err.response.headers.get("x-test");
      expect(x).toBe("ok");
      expect(err.data).toBeDefined();
      expect(err.data.code).toBe("custom_error");
      expect(err.data.info).toBe("Extra");
    }
  });
});
