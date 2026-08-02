import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiHandler } from './api-server.mjs';

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
const port = Number(process.env.PORT || 4173);
const host = String(process.env.SEEDANCE_BIND_HOST || '127.0.0.1').trim() || '127.0.0.1';
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const handleApi = createApiHandler();

function resolvePath(urlPath) {
  const pathname = decodeURIComponent((urlPath || '/').split('?')[0]);
  const candidate = normalize(join(root, pathname === '/' ? 'index.html' : pathname.slice(1)));
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return null;
  return candidate;
}

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;
  if (pathname.startsWith('/api/') && await handleApi(request, response, pathname)) return;
  const filePath = resolvePath(request.url);
  if (!filePath) { response.writeHead(403); response.end('Forbidden'); return; }
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error('Not a file');
    const body = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': mime[extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

server.on('error', (error) => { console.error(error); process.exitCode = 1; });
server.listen(port, host, () => console.log(`Seedance Flow dev server: http://${host}:${port}`));
