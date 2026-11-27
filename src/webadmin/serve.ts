import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createWebAdmin } from "./admin.ts";
import { handleAdminRequest, type Json } from "./routes.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readStatic(name: string): string {
  return readFileSync(join(here, name), "utf8");
}

function send(response: ServerResponse, status: number, body: string, contentType: string): void {
  response.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
  });
  response.end(body);
}

async function readJsonBody(request: IncomingMessage): Promise<Json | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Json;
}

export interface RunningWebAdmin {
  port: number;
  close: () => Promise<void>;
}

export function startWebAdminServer(port = 0): Promise<RunningWebAdmin> {
  const admin = createWebAdmin();
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        send(response, 200, readStatic("page.html"), "text/html; charset=utf-8");
        return;
      }
      if (request.method === "GET" && url.pathname === "/client.js") {
        send(response, 200, readStatic("client.js"), "text/javascript; charset=utf-8");
        return;
      }
      const method = request.method === "POST" ? "POST" : "GET";
      if (method !== "GET" && method !== "POST") {
        send(response, 405, JSON.stringify({ error: "Method not allowed." }), "application/json");
        return;
      }
      const result = handleAdminRequest(admin, {
        method,
        path: url.pathname,
        headers: {
          authorization: request.headers.authorization,
        },
        body: method === "POST" ? await readJsonBody(request) : undefined,
      });
      send(response, result.status, JSON.stringify(result.body), "application/json; charset=utf-8");
    } catch {
      send(response, 400, JSON.stringify({ error: "Request failed." }), "application/json");
    }
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const bound = typeof address === "object" && address ? address.port : port;
      resolve({
        port: bound,
        close: () =>
          new Promise((done, reject) => {
            server.close((error) => (error ? reject(error) : done()));
          }),
      });
    });
  });
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const port = Number(process.env.WEB_ADMIN_PORT ?? 8787);
  const running = await startWebAdminServer(port);
  console.log(`webadmin listening on http://127.0.0.1:${running.port}`);
}
