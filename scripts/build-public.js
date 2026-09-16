const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, ".."),
  out = path.join(root, "public");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const file of [
  "index.html",
  "offline.html",
  "offline.js",
  "offline-metrics.js",
  "academic.js",
  "academic.css",
  "compiler.js",
  "mapper.js",
  "execution-worker.js",
  "sw.js",
  "manifest.json",
  "icons",
  "vendor",
])
  if (fs.existsSync(path.join(root, file)))
    fs.cpSync(path.join(root, file), path.join(out, file), { recursive: true });
