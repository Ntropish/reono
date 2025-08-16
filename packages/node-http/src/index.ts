import { render, type JSXElement } from "reono";
import * as http from "node:http";
import { Readable } from "node:stream";

function nodeRequestToFetch(req: http.IncomingMessage): Request {
  const proto = (req.socket as any).encrypted ? "https" : "http";
  const host = req.headers["host"] || "localhost";
  const url = `${proto}://${host}${req.url ?? "/"}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) headers.set(k, v.join(", "));
    else if (typeof v === "string") headers.set(k, v);
  }
  const method = req.method || "GET";
  const hasBody = !(method === "GET" || method === "HEAD");
  const init: RequestInit = { method, headers } as RequestInit & {
    duplex?: "half";
  };
  if (hasBody) {
    (init as any).body = Readable.toWeb(req);
    // Required by Node/undici when passing a ReadableStream as body
    (init as any).duplex = "half";
  }
  return new Request(url, init);
}

async function writeFetchResponse(
  res: http.ServerResponse,
  response: Response
) {
  res.statusCode = response.status;
  res.statusMessage = response.statusText;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  // For simplicity, buffer the body. Adequate for prototype; can stream later.
  if (response.body) {
    const buf = Buffer.from(await response.arrayBuffer());
    if (!res.hasHeader("content-length")) {
      res.setHeader("content-length", String(buf.byteLength));
    }
    res.end(buf);
  } else {
    res.end();
  }
}

export function createNodeApp() {
  let server: http.Server | undefined;
  let handler: ((req: Request) => Promise<Response>) | undefined;

  return {
    serve(element: JSXElement) {
      handler = render(element);
    },
    listen(port: number, cb?: () => void) {
      if (!handler)
        throw new Error("serve(element) must be called before listen()");
      server = http.createServer(async (req, res) => {
        try {
          const request = nodeRequestToFetch(req);
          const response = await handler!(request);
          await writeFetchResponse(res, response);
        } catch (err) {
          console.error("Unhandled error in request handler:", err);
          res.statusCode = 500;
          res.end("Internal Server Error");
        }
      });
      server.listen(port, cb);
    },
    close(cb?: (err?: Error) => void) {
      server?.close(cb);
    },
  };
}
