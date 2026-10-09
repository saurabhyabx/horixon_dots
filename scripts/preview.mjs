// Local production preview. Serves the built Cloudflare bundle the way the platform does:
// hashed static assets from .output/public first, everything else through the Worker.
// Usage: npm run build && npm run preview   (PORT=5000 npm run preview to change the port)
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const port = Number(process.env.PORT ?? 4173);
const publicDir = path.resolve(".output/public");
const entry = path.resolve(".output/server/index.mjs");

const types = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

let worker;
try {
  worker = (await import(pathToFileURL(entry).href)).default;
} catch {
  console.error("No production build found. Run `npm run build` first.");
  process.exit(1);
}

async function readAsset(urlPath) {
  const file = path.resolve(publicDir, decodeURIComponent(urlPath).replace(/^\/+/, ""));
  if (!file.startsWith(publicDir + path.sep)) return null; // never serve outside the public folder
  try {
    if (!(await fs.stat(file)).isFile()) return null;
    return {
      body: await fs.readFile(file),
      type: types[path.extname(file)] ?? "application/octet-stream",
    };
  } catch {
    return null;
  }
}

const env = {
  ASSETS: {
    fetch: async (request) => {
      const asset = await readAsset(new URL(request.url).pathname);
      return asset
        ? new Response(asset.body, { headers: { "content-type": asset.type } })
        : new Response("Not found", { status: 404 });
    },
  },
};

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const asset = url.pathname === "/" ? null : await readAsset(url.pathname);
      if (asset) {
        res.writeHead(200, {
          "content-type": asset.type,
          "cache-control": url.pathname.startsWith("/assets/")
            ? "public, max-age=31536000, immutable"
            : "no-cache",
        });
        res.end(asset.body);
        return;
      }
      const response = await worker.fetch(
        new Request(url, { method: req.method === "HEAD" ? "HEAD" : "GET" }),
        env,
        { waitUntil() {}, passThroughOnException() {} },
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      console.error(error);
      res.writeHead(500, { "content-type": "text/plain" });
      res.end("Server error");
    }
  })
  .listen(port, () => console.log(`Production preview: http://localhost:${port}`));
