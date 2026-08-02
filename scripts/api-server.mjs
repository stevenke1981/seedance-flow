import { cancelGenerationTask, createGenerationTask, getGenerationTask, DEFAULT_ARK_BASE_URL, DEFAULT_REQUEST_TIMEOUT_MS } from '../src/ark-adapter.mjs';
import { createRateLimiter, normalizeBridgeConfig, originDecision } from '../src/bridge-policy.mjs';

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

function sendJson(response, status, body, extraHeaders = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extraHeaders });
  if (status === 204) { response.end(); return; }
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
  const bridgeConfig = options.bridgeConfig || normalizeBridgeConfig(process.env);
  const rateLimiter = options.rateLimiter || createRateLimiter(bridgeConfig.rateLimitPerMinute, options.now);
  const corsHeaders = (origin) => origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
  const clientKey = (request) => bridgeConfig.trustProxy && request.headers['x-forwarded-for'] ? String(request.headers['x-forwarded-for']).split(',')[0].trim() : (request.socket?.remoteAddress || 'unknown');
  const guardedEndpoint = (request, response) => {
    const origin = typeof request.headers.origin === 'string' ? request.headers.origin : '';
    const decision = originDecision(origin, bridgeConfig);
    if (!decision.allowed) {
      sendJson(response, 403, { error: { message: '此來源未被 API bridge 允許。', code: decision.reason || 'ORIGIN_NOT_ALLOWED', requestId: '', retryable: false } });
      return null;
    }
    const cors = corsHeaders(origin && bridgeConfig.allowedOrigins.includes(origin) ? origin : '');
    const rate = rateLimiter.consume(clientKey(request));
    if (!rate.allowed) {
      sendJson(response, 429, { error: { message: 'API bridge 請求過於頻繁，請稍後再試。', code: 'BRIDGE_RATE_LIMIT', requestId: '', retryable: true } }, { ...cors, 'Retry-After': String(rate.retryAfterSeconds) });
      return null;
    }
    return cors;
  };
  return async function handleApi(request, response, pathname) {
    try {
      if (request.method === 'OPTIONS' && pathname.startsWith('/api/')) {
        const origin = typeof request.headers.origin === 'string' ? request.headers.origin : '';
        const decision = originDecision(origin, bridgeConfig);
        if (!decision.allowed) {
          sendJson(response, 403, { error: { message: '此來源未被 API bridge 允許。', code: decision.reason || 'ORIGIN_NOT_ALLOWED', requestId: '', retryable: false } });
          return true;
        }
        sendJson(response, 204, null, { ...corsHeaders(origin), 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Ark-Api-Key' });
        return true;
      }
      if (request.method === 'GET' && pathname === '/api/health') {
        sendJson(response, 200, {
          ok: true,
          provider: 'volcengine-ark',
          mode: baseUrl === DEFAULT_ARK_BASE_URL ? 'ark-default' : 'custom-upstream',
          baseUrl: publicBaseUrl(baseUrl),
          limits: { maxBodyBytes: MAX_BODY_BYTES, requestTimeoutMs, maxDurationSeconds: 180, maxReferenceImages: 3 },
          security: { originPolicy: bridgeConfig.requireOrigin ? 'required' : (bridgeConfig.allowedOrigins.length ? 'allowlist' : 'same-origin-default'), allowedOriginCount: bridgeConfig.allowedOrigins.length, rateLimitPerMinute: bridgeConfig.rateLimitPerMinute, trustProxy: bridgeConfig.trustProxy },
        });
        return true;
      }
      if (request.method === 'POST' && pathname === '/api/generations') {
        const cors = guardedEndpoint(request, response);
        if (!cors) return true;
        const body = await readJson(request);
        const result = await createGenerationTask({ ...body, apiKey: apiKey(request) }, { fetchImpl, baseUrl, timeoutMs: requestTimeoutMs });
        sendJson(response, 202, result, cors);
        return true;
      }
      const taskMatch = pathname.match(/^\/api\/generations\/([^/]+)$/);
      if (request.method === 'GET' && taskMatch) {
        const cors = guardedEndpoint(request, response);
        if (!cors) return true;
        const result = await getGenerationTask(decodeURIComponent(taskMatch[1]), apiKey(request), { fetchImpl, baseUrl, timeoutMs: requestTimeoutMs });
        sendJson(response, 200, result, cors);
        return true;
      }
      if (request.method === 'DELETE' && taskMatch) {
        const cors = guardedEndpoint(request, response);
        if (!cors) return true;
        const result = await cancelGenerationTask(decodeURIComponent(taskMatch[1]), apiKey(request), { fetchImpl, baseUrl, timeoutMs: requestTimeoutMs });
        sendJson(response, 200, result, cors);
        return true;
      }
      return false;
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 502;
      const origin = typeof request.headers.origin === 'string' ? request.headers.origin : '';
      const cors = origin && bridgeConfig.allowedOrigins.includes(origin) ? corsHeaders(origin) : {};
      sendJson(response, status, {
        error: {
          message: status >= 500 ? (error.message || 'Seedance API request failed.') : error.message,
          code: error.code || 'SEEDANCE_API_ERROR',
          requestId: error.requestId || '',
          retryable: error.retryable === true,
        },
      }, cors);
      return true;
    }
  };
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}`) {
  console.log('API handler module: use scripts/dev-server.mjs');
}
