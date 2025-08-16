import type { Element, ApiContext, MiddlewareHandler } from "../components";
import { createElement } from "../jsx";

export interface FileUploadProps {
  maxSize?: number;
  allowedTypes?: string[];
  children?: Element | Element[];
}

/**
 * FileUpload component provides file upload validation and processing.
 *
 * @example
 * ```tsx
 * // Basic file upload validation
 * <FileUpload maxSize={10 * 1024 * 1024} allowedTypes={["image/jpeg", "image/png"]}>
 *   <post
 *     path="upload"
 *     handler={(c) => {
 *       const files = c.state.get("uploadedFiles");
 *       return c.json({ uploaded: files.length });
 *     }}
 *   />
 * </FileUpload>
 *
 * // Multiple file upload endpoints
 * <FileUpload
 *   maxSize={50 * 1024 * 1024}
 *   allowedTypes={["application/pdf", "image/*"]}
 * >
 *   <router path="files">
 *     <post path="documents" handler={handleDocuments} />
 *     <post path="images" handler={handleImages} />
 *   </router>
 * </FileUpload>
 * ```
 */
export function FileUpload({
  maxSize,
  allowedTypes,
  children,
}: FileUploadProps): Element {
  const uploadMiddleware: MiddlewareHandler = async (ctx, next) => {
    // Only process multipart/form-data requests
    const contentType = ctx.req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return next();
    }

    // Check if body is FormData
    if (!(ctx.body instanceof FormData)) {
      return ctx.json({ error: "Expected multipart/form-data" }, 400);
    }

    const files: Array<{ key: string; file: File }> = [];

    console.log("FileUpload middleware processing:", {
      maxSize,
      allowedTypes: allowedTypes?.join(", "),
    });

    console.log("FileUpload middleware processing:", {
      maxSize,
      allowedTypes: allowedTypes?.join(", "),
    });

    // Process all form entries
    for (const [key, value] of ctx.body.entries()) {
      if (value instanceof File) {
        console.log(
          `Processing file: ${value.name}, size: ${value.size}, type: ${value.type}`
        );
        console.log(
          `Processing file: ${value.name}, size: ${value.size}, type: ${value.type}`
        );

        // Validate file size
        if (maxSize && value.size > maxSize) {
          console.log(
            `File ${value.name} rejected: size ${value.size} > limit ${maxSize}`
          );
          return ctx.json(
            {
              error: `File ${value.name} too large. Maximum size: ${maxSize} bytes`,
            },
            400
          );
        }

        // Validate file type
        if (allowedTypes && allowedTypes.length > 0) {
          const isAllowed = allowedTypes.some((type) => {
            if (type.endsWith("/*")) {
              // Handle wildcard types like "image/*"
              const baseType = type.slice(0, -2);
              return value.type.startsWith(baseType);
            }
            return value.type === type;
          });

          if (!isAllowed) {
            console.log(
              `File ${value.name} rejected: type ${value.type} not in allowed types: ${allowedTypes.join(", ")}`
            );
            return ctx.json(
              {
                error: `File type ${value.type} not allowed. Allowed types: ${allowedTypes.join(", ")}`,
              },
              400
            );
          }
        }

        console.log(`File ${value.name} accepted`);
        files.push({ key, file: value });
      }
    }

    console.log(`Setting ${files.length} files in state`);
    // Store validated files in context state
    ctx.state.set("uploadedFiles", files);
    ctx.state.set("uploadedFileCount", files.length);

    return next();
  };

  return createElement("use", { handler: uploadMiddleware }, children);
}
