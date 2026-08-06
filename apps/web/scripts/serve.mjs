import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Serves the built client on a loopback origin so the page can be inspected like production. */

const distDirectory = resolve(fileURLToPath(new URL("../dist", import.meta.url)));
const port = Number(process.env.PORT ?? 8137);
const contentTypes = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8" };

const server = createServer(async (request, response) => {
  const requested = new URL(request.url ?? "/", "http://127.0.0.1");
  const path = requested.pathname === "/" ? "index.html" : normalize(requested.pathname).replace(/^[/\\]+/, "");
  const target = join(distDirectory, path);
  if (target !== distDirectory && !target.startsWith(distDirectory + "/")) {
    response.writeHead(403, { "content-type": "text/plain" }).end("Forbidden");
    return;
  }
  try {
    await stat(target);
  } catch {
    response.writeHead(404, { "content-type": "text/plain" }).end("Not found");
    return;
  }
  response.writeHead(200, { "content-type": contentTypes[extname(target)] ?? "application/octet-stream" });
  createReadStream(target).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Draft Table is serving the built client at http://127.0.0.1:${port}/`);
});
