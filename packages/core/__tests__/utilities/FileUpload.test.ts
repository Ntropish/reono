import { describe, it, expect, beforeAll } from "vitest";
import { render, createElement } from "../../src";
import { FileUpload } from "../../src/utilities/FileUpload";
import type { ApiContext } from "../../src/components";

let handle: (req: Request) => Promise<Response>;

function makeRequest(path: string, options: RequestInit = {}) {
  return new Request(`http://localhost${path}`, options);
}

// Helper to create a mock FormData with files
function createFormDataWithFiles(
  files: Array<{ name: string; size: number; type: string; content: string }>
) {
  const formData = new FormData();

  files.forEach(({ name, size, type, content }) => {
    // Create content that matches the expected size
    const actualContent =
      content.length >= size ? content : content.padEnd(size, "0");

    // Create a File object with content that matches the size
    const file = new File([actualContent], name, { type });
    formData.append("file", file);
  });

  return formData;
}

describe("FileUpload Component", () => {
  beforeAll(() => {
    const tree = createElement(
      "router",
      { path: "" },

      // Basic file upload with size and type restrictions
      FileUpload({
        maxSize: 1024 * 1024, // 1MB
        allowedTypes: ["image/jpeg", "image/png"],
        children: createElement("post", {
          path: "upload/images",
          handler: (c: ApiContext) => {
            const files = c.state.get("uploadedFiles");
            return c.json({
              uploaded: files.length,
              files: files.map((f: any) => ({
                name: f.file.name,
                type: f.file.type,
              })),
            });
          },
        }),
      }),

      // File upload with wildcard types
      FileUpload({
        maxSize: 5 * 1024 * 1024, // 5MB
        allowedTypes: ["image/*", "application/pdf"],
        children: createElement("post", {
          path: "upload/documents",
          handler: (c: ApiContext) => {
            const files = c.state.get("uploadedFiles");
            const count = c.state.get("uploadedFileCount");
            return c.json({ uploaded: count, files });
          },
        }),
      }),

      // No restrictions
      FileUpload({
        children: createElement("post", {
          path: "upload/any",
          handler: (c: ApiContext) => {
            const files = c.state.get("uploadedFiles") || [];
            return c.json({ message: "Upload processed", count: files.length });
          },
        }),
      }),

      // Non-upload route to test passthrough
      createElement("post", {
        path: "regular",
        handler: (c: ApiContext) => c.json({ message: "Regular endpoint" }),
      })
    );

    handle = render(tree as any);
  });

  it("accepts valid files within limits", async () => {
    const formData = createFormDataWithFiles([
      {
        name: "photo.jpg",
        size: 500000,
        type: "image/jpeg",
        content: "fake jpg content",
      },
    ]);

    const res = await handle(
      makeRequest("/upload/images", {
        method: "POST",
        body: formData,
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({
      uploaded: 1,
      files: [{ name: "photo.jpg", type: "image/jpeg" }],
    });
  });

  it("rejects files that are too large", async () => {
    const formData = createFormDataWithFiles([
      {
        name: "huge.jpg",
        size: 2 * 1024 * 1024,
        type: "image/jpeg",
        content: "huge file",
      },
    ]);

    const res = await handle(
      makeRequest("/upload/images", {
        method: "POST",
        body: formData,
      })
    );

    expect(res.status).toBe(400);
    const error = await res.json();
    expect(error.error).toMatch(/too large/i);
  });

  it("rejects files with disallowed types", async () => {
    const formData = createFormDataWithFiles([
      {
        name: "document.pdf",
        size: 100000,
        type: "application/pdf",
        content: "pdf content",
      },
    ]);

    const res = await handle(
      makeRequest("/upload/images", {
        method: "POST",
        body: formData,
      })
    );

    expect(res.status).toBe(400);
    const error = await res.json();
    expect(error.error).toMatch(/not allowed/i);
    expect(error.error).toMatch(/image\/jpeg, image\/png/);
  });

  it("supports wildcard MIME types", async () => {
    const formData = createFormDataWithFiles([
      {
        name: "photo.gif",
        size: 200000,
        type: "image/gif",
        content: "gif content",
      },
    ]);

    const res = await handle(
      makeRequest("/upload/documents", {
        method: "POST",
        body: formData,
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.uploaded).toBe(1);
  });

  it("accepts PDF files when allowed", async () => {
    const formData = createFormDataWithFiles([
      {
        name: "document.pdf",
        size: 1024000,
        type: "application/pdf",
        content: "pdf content",
      },
    ]);

    const res = await handle(
      makeRequest("/upload/documents", {
        method: "POST",
        body: formData,
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.uploaded).toBe(1);
  });

  it("works without restrictions", async () => {
    const formData = createFormDataWithFiles([
      {
        name: "anything.xyz",
        size: 10000000,
        type: "application/unknown",
        content: "unknown content",
      },
    ]);

    const res = await handle(
      makeRequest("/upload/any", {
        method: "POST",
        body: formData,
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.count).toBe(1);
  });

  it("passes through non-multipart requests", async () => {
    const res = await handle(
      makeRequest("/regular", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: "test" }),
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ message: "Regular endpoint" });
  });
  it("returns error for non-FormData multipart requests", async () => {
    const res = await handle(
      makeRequest("/upload/images", {
        method: "POST",
        headers: { "content-type": "multipart/form-data" },
        body: "not form data",
      })
    );

    expect(res.status).toBe(400);
    const error = await res.json();
    
    // The pipeline should fail to parse invalid multipart data
    expect(error.error).toBe("ValidationError");
    expect(error.message).toBe("Failed to parse body as FormData.");
  });
});
