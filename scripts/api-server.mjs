import { cancelGenerationTask, createGenerationTask, getGenerationTask, DEFAULT_ARK_BASE_URL, DEFAULT_REQUEST_TIMEOUT_MS } from '../src/ark-adapter.mjs';

const MAX_BODY_BYTES = 1_048_576;

async function readJson(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw Object.assign(new Error('Request body too large.'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('Invalid JSON.'), { status: 400 }); }
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(body));
}

function apiKey(request) {
  return typeof request.headers['x-ark-api-key'] === 'string' ? request.headers['x-ark-api-key'] : '';
}

function publicBaseUrl(value) {
  try {
    const parsed = new URL(value);
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function createApiHandler(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const baseUrl = options.baseUrl || process.env.SEEDANCE_API_BASE_URL || DEFAULT_ARK_BASE_URL;
  const requestTimeoutMs = Number.isFinite(options.requestTimeoutMs) ? Math.max(1_000, Math.round(options.requestTimeoutMs)) : (Number(process.env.SEEDANCE_REQUEST_TIMEOUT_MS) || DEFAULT_REQUEST_TIMEOUT_MS);
  return async function handleApi(request, response, pathname) {
    try {
      if (request.method === 'GET' && pathname === '/api/health') {
        sendJson(response, 200, {
          ok: true,
          provider: 'volcengine-ark',
          mode: baseUrl === DEFAULT_ARK_BASE_URL ? 'ark-default' : 'custom-upstream',
          baseUrl: publicBaseUrl(baseUrl),
          limits: { maxBodyBytes: MAX_BODY_BYTES, requestTimeoutMs, maxDurationSeconds: 180, maxReferenceImages: 3 },
        });
        return true;
      }
      if (request.method === 'POST' && pathname === '/api/generations') {
        const body = await readJson(request);
        const result = await createGenerationTask({ ...body, apiKey: apiKey(request) }, { fetchImpl, baseUrl, timeoutMs: requestTimeoutMs });
        sendJson(response, 202, result);
        return true;
      }
      const taskMatch = pathname.match(/^\/api\/generations\/([^/]+)$/);
      if (request.method === 'GET' && taskMatch) {
        const result = await getGenerationTask(decodeURIComponent(taskMatch[1]), apiKey(request), { fetchImpl, baseUrl, timeoutMs: requestTimeoutMs });
        sendJson(response, 200, result);
        return true;
      }
      if (request.method === 'DELETE' && taskMatch) {
        const result = await cancelGenerationTask(decodeURIComponent(taskMatch[1]), apiKey(request), { fetchImpl, baseUrl, timeoutMs: requestTimeoutMs });
        sendJson(response, 200, result);
        return true;
      }
      return false;
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 502;
      sendJson(response, status, {
        error: {
          message: status >= 500 ? (error.message || 'Seedance API request failed.') : error.message,
          code: error.code || 'SEEDANCE_API_ERROR',
          requestId: error.requestId || '',
          retryable: error.retryable === true,
        },
      });
      return true;
    }
  };
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}`) {
  console.log('API handler module: use scripts/dev-server.mjs');
}
