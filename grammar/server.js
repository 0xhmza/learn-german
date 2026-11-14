// Development server for the grammar platform. Serves src/ and builds
// content.json from content/ on every request, so edits show on reload.
// With --dist it serves the built dist/ folder instead (npm run preview).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { assembleContent } from './scripts/assemble-content.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(root, 'src');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8'
};

// Resolves a request path inside src/, or null when it leaves the folder.
export function safePath(base, requestPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const file = path.resolve(base, `.${path.posix.normalize(`/${decoded}`)}`);
  return file === base || file.startsWith(base + path.sep) ? file : null;
}

export function createApp({ dist = false } = {}) {
  const base = dist ? path.join(root, 'dist') : srcRoot;
  const home = dist ? '/Deutsch-Grammatik-B1.html' : '/index.html';
  return createServer(async (req, res) => {
    const send = (status, body, type = 'text/plain; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(body);
    };
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'Method not allowed');
      const { pathname } = new URL(req.url, 'http://localhost');
      if (!dist && pathname === '/content.json') return send(200, JSON.stringify(await assembleContent()), types['.json']);
      const file = safePath(base, pathname === '/' ? home : pathname);
      if (!file) return send(404, 'Not found');
      const info = await stat(file).catch(() => null);
      if (!info?.isFile()) return send(404, 'Not found');
      return send(200, req.method === 'HEAD' ? '' : await readFile(file), types[path.extname(file)] || 'application/octet-stream');
    } catch (error) {
      console.error(error);
      return send(500, 'Server error');
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dist = process.argv.includes('--dist');
  const port = Number(process.env.PORT || (dist ? 4181 : 4180));
  createApp({ dist }).listen(port, '127.0.0.1', () => console.log(`Grammatikinseln${dist ? ' (dist)' : ''}: http://127.0.0.1:${port}`));
}
