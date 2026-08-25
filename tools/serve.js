'use strict';
// Static server for the renderer, so the platform-neutral half of the app can
// be driven in a plain browser during development and in the smoke test.
// `npm run serve` then open http://localhost:8137/app/renderer/index.html

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8137);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  let name;
  try {
    name = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400).end('bad request');
    return;
  }
  if (name === '/') name = '/app/renderer/index.html';
  const file = path.resolve(ROOT, '.' + name);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store',
    }).end(buf);
  });
});

server.listen(PORT, () => {
  process.stdout.write(
    `serving ${ROOT} at http://localhost:${PORT}/app/renderer/index.html\n`);
});
