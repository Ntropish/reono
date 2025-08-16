import { describe, it, expect } from "vitest";
import {
  buildContext,
  parseCookies,
  getMimeTypeFromFilename,
} from "../src/runtime/pipeline";

describe("Enhanced ApiContext", () => {
  it("parses query parameters correctly", async () => {
    const req = new Request("https://example.com/test?foo=bar&baz=qux");
    const ctx = await buildContext(req);

    expect(ctx.query.get("foo")).toBe("bar");
    expect(ctx.query.get("baz")).toBe("qux");
    expect(ctx.url.pathname).toBe("/test");
  });

  it("parses cookies correctly", async () => {
    const req = new Request("https://example.com/test", {
      headers: { cookie: "session=abc123; theme=dark; lang=en" },
    });
    const ctx = await buildContext(req);

    expect(ctx.cookies.get("session")).toBe("abc123");
    expect(ctx.cookies.get("theme")).toBe("dark");
    expect(ctx.cookies.get("lang")).toBe("en");
  });

  it("provides access to headers", async () => {
    const req = new Request("https://example.com/test", {
      headers: {
        "x-api-key": "secret123",
        "user-agent": "test-client",
      },
    });
    const ctx = await buildContext(req);

    expect(ctx.headers.get("x-api-key")).toBe("secret123");
    expect(ctx.headers.get("user-agent")).toBe("test-client");
  });

  it("initializes empty state map", async () => {
    const req = new Request("https://example.com/test");
    const ctx = await buildContext(req);

    expect(ctx.state).toBeInstanceOf(Map);
    expect(ctx.state.size).toBe(0);
  });

  it("handles requests without cookies", async () => {
    const req = new Request("https://example.com/test");
    const ctx = await buildContext(req);

    expect(ctx.cookies).toBeInstanceOf(Map);
    expect(ctx.cookies.size).toBe(0);
  });

  it("preserves existing functionality", async () => {
    const req = new Request("https://example.com/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "test" }),
    });
    const ctx = await buildContext(req);

    expect(ctx.params).toEqual({});
    expect(ctx.body).toEqual({ name: "test" });
    expect(ctx.req).toBe(req);
    expect(typeof ctx.json).toBe("function");
  });
});

describe("Response Helpers", () => {
  it("text helper sets correct content-type", async () => {
    const req = new Request("https://example.com/test");
    const ctx = await buildContext(req);

    const response = ctx.text("Hello World", 201);
    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8"
    );
    expect(await response.text()).toBe("Hello World");
  });

  it("html helper sets correct content-type", async () => {
    const req = new Request("https://example.com/test");
    const ctx = await buildContext(req);

    const response = ctx.html("<h1>Hello</h1>");
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8"
    );
    expect(await response.text()).toBe("<h1>Hello</h1>");
  });

  it("redirect helper sets location header", async () => {
    const req = new Request("https://example.com/test");
    const ctx = await buildContext(req);

    const response = ctx.redirect("/new-location", 301);
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("/new-location");
  });

  it("redirect helper defaults to 302", async () => {
    const req = new Request("https://example.com/test");
    const ctx = await buildContext(req);

    const response = ctx.redirect("/new-location");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/new-location");
  });

  it("file helper sets correct headers", async () => {
    const req = new Request("https://example.com/test");
    const ctx = await buildContext(req);

    const data = new TextEncoder().encode("file content");
    const response = ctx.file(data, "test.txt");

    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="test.txt"'
    );
    expect(response.headers.get("content-type")).toBe("text/plain");
  });

  it("file helper works without filename", async () => {
    const req = new Request("https://example.com/test");
    const ctx = await buildContext(req);

    const data = new TextEncoder().encode("file content");
    const response = ctx.file(data);

    expect(response.headers.get("content-disposition")).toBeNull();
    expect(response.headers.get("content-type")).toBe(
      "application/octet-stream"
    );
  });

  it("stream helper works correctly", async () => {
    const req = new Request("https://example.com/test");
    const ctx = await buildContext(req);

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("chunk 1"));
        controller.enqueue(new TextEncoder().encode("chunk 2"));
        controller.close();
      },
    });

    const response = ctx.stream(stream, { status: 206 });
    expect(response.status).toBe(206);
    expect(response.body).toBe(stream);
  });

  it("response helpers update context res property", async () => {
    const req = new Request("https://example.com/test");
    const ctx = await buildContext(req);

    const jsonResponse = ctx.json({ test: true });
    expect(ctx.res).toBe(jsonResponse);

    const textResponse = ctx.text("hello");
    expect(ctx.res).toBe(textResponse);

    const htmlResponse = ctx.html("<p>test</p>");
    expect(ctx.res).toBe(htmlResponse);

    const redirectResponse = ctx.redirect("/test");
    expect(ctx.res).toBe(redirectResponse);
  });
});

describe("Utility Functions", () => {
  it("parseCookies handles various cookie formats", () => {
    expect(parseCookies("a=1; b=2; c=3")).toEqual(
      new Map([
        ["a", "1"],
        ["b", "2"],
        ["c", "3"],
      ])
    );

    expect(parseCookies("session=abc=def; empty=")).toEqual(
      new Map([
        ["session", "abc=def"],
        ["empty", ""],
      ])
    );

    expect(parseCookies("")).toEqual(new Map());
    expect(parseCookies("   ")).toEqual(new Map());
  });

  it("parseCookies handles malformed cookies gracefully", () => {
    expect(parseCookies("invalid")).toEqual(new Map());
    expect(parseCookies("=value")).toEqual(new Map());
    expect(parseCookies("name=")).toEqual(new Map([["name", ""]]));
  });

  it("getMimeTypeFromFilename returns correct types", () => {
    expect(getMimeTypeFromFilename("test.json")).toBe("application/json");
    expect(getMimeTypeFromFilename("image.png")).toBe("image/png");
    expect(getMimeTypeFromFilename("style.css")).toBe("text/css");
    expect(getMimeTypeFromFilename("script.js")).toBe("application/javascript");
    expect(getMimeTypeFromFilename("page.html")).toBe("text/html");
    expect(getMimeTypeFromFilename("unknown.xyz")).toBeNull();
    expect(getMimeTypeFromFilename("noextension")).toBeNull();
  });

  it("getMimeTypeFromFilename is case insensitive", () => {
    expect(getMimeTypeFromFilename("TEST.JSON")).toBe("application/json");
    expect(getMimeTypeFromFilename("Image.PNG")).toBe("image/png");
    expect(getMimeTypeFromFilename("Style.CSS")).toBe("text/css");
  });
});

describe("Enhanced Body Parsing", () => {
  it("parses FormData for multipart requests", async () => {
    const formData = new FormData();
    formData.append("text", "hello");
    formData.append("number", "42");

    // Create a mock Request with properly formatted multipart content
    const req = new Request("https://example.com/test", {
      method: "POST",
      body: formData, // Let FormData set its own content-type with boundary
    });

    const ctx = await buildContext(req);
    expect(ctx.body).toBeInstanceOf(FormData);
    expect(ctx.body.get("text")).toBe("hello");
    expect(ctx.body.get("number")).toBe("42");
  });

  it("parses ArrayBuffer for binary requests", async () => {
    const binaryData = new Uint8Array([1, 2, 3, 4, 5]);

    const req = new Request("https://example.com/test", {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: binaryData,
    });

    const ctx = await buildContext(req);
    expect(ctx.body).toBeInstanceOf(ArrayBuffer);
    const result = new Uint8Array(ctx.body);
    expect(Array.from(result)).toEqual([1, 2, 3, 4, 5]);
  });

  it("preserves existing JSON parsing behavior", async () => {
    const req = new Request("https://example.com/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ test: "value" }),
    });

    const ctx = await buildContext(req);
    expect(ctx.body).toEqual({ test: "value" });
  });

  it("preserves existing text parsing behavior", async () => {
    const req = new Request("https://example.com/test", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "plain text content",
    });

    const ctx = await buildContext(req);
    expect(ctx.body).toBe("plain text content");
  });

  it("preserves existing form-urlencoded parsing behavior", async () => {
    const req = new Request("https://example.com/test", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ name: "test", value: "data" }),
    });

    const ctx = await buildContext(req);
    expect(ctx.body).toEqual({ name: "test", value: "data" });
  });
});
