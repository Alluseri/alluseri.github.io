import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".ico", "image/x-icon"]
]);

function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl, "http://localhost");
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const unsafePath = path.join(projectRoot, pathname);
  const resolvedPath = path.resolve(unsafePath);

  if (!resolvedPath.startsWith(projectRoot)) {
    return null;
  }

  return resolvedPath;
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

const server = http.createServer(async (request, response) => {
  const targetPath = resolveRequestPath(request.url ?? "/");

  if (!targetPath) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  let filePath = targetPath;

  if (!(await fileExists(filePath))) {
    filePath = path.join(projectRoot, "index.html");
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes.get(extension) ?? "application/octet-stream";

  response.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-cache"
  });

  createReadStream(filePath).pipe(response);
});

const port = Number.parseInt(process.env.PORT ?? "4173", 10);
const host = process.env.HOST ?? "127.0.0.1";

server.listen(port, host, () => {
  console.log(`Sound Delta-E server running at http://${host}:${port}`);
});
