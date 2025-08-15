import { render } from "@workspace/server";
import type { JSXElement } from "@workspace/server";
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
  const body =
    method === "GET" || method === "HEAD"
      ? undefined
      : (Readable.toWeb(req) as any);
  return new Request(url, { method, headers, body } as RequestInit);
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
  const body = response.body;
  if (!body) {
    res.end();
    return;
  }
  const reader = body.getReader();
  function pump() {
    reader
      .read()
      .then(({ done, value }) => {
        if (done) {
          res.end();
          return;
        }
        res.write(Buffer.from(value));
        pump();
      })
      .catch(() => res.end());
  }
  pump();
}

export function createNodeApp() {
  let server: http.Server | undefined;
  let handler: ((req: Request) => Promise<Response>) | undefined;

  return {
    serve(element: JSXElement) {
      handler = render(element as any);
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
