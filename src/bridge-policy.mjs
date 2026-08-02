export const DEFAULT_BRIDGE_CONFIG = Object.freeze({
  bindHost: '127.0.0.1',
  allowedOrigins: [],
  rateLimitPerMinute: 60,
  requireOrigin: false,
  trustProxy: false,
});

const RATE_LIMIT_MIN = 1;
const RATE_LIMIT_MAX = 600;

function booleanValue(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  return fallback;
}

function boundedRateLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_BRIDGE_CONFIG.rateLimitPerMinute;
  return Math.min(RATE_LIMIT_MAX, Math.max(RATE_LIMIT_MIN, Math.round(parsed)));
}

export function parseOriginList(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  const allowedOrigins = [];
  const invalidOrigins = [];
  values.map((item) => String(item).trim()).filter(Boolean).forEach((origin) => {
    try {
      const parsed = new URL(origin);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('invalid origin');
      const normalized = parsed.origin;
      if (!allowedOrigins.includes(normalized)) allowedOrigins.push(normalized);
    } catch {
      invalidOrigins.push(origin);
    }
  });
  return { allowedOrigins, invalidOrigins };
}

export function normalizeBridgeConfig(env = {}) {
  const origins = parseOriginList(env.SEEDANCE_ALLOWED_ORIGINS);
  return {
    bindHost: String(env.SEEDANCE_BIND_HOST || DEFAULT_BRIDGE_CONFIG.bindHost).trim() || DEFAULT_BRIDGE_CONFIG.bindHost,
    allowedOrigins: origins.allowedOrigins,
    invalidOrigins: origins.invalidOrigins,
    rateLimitPerMinute: boundedRateLimit(env.SEEDANCE_RATE_LIMIT_PER_MINUTE),
    requireOrigin: booleanValue(env.SEEDANCE_REQUIRE_ORIGIN, DEFAULT_BRIDGE_CONFIG.requireOrigin),
    trustProxy: booleanValue(env.SEEDANCE_TRUST_PROXY, DEFAULT_BRIDGE_CONFIG.trustProxy),
  };
}

function validHttpsOrigin(origin) {
  try {
    return new URL(origin).protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateProductionBridgeConfig(env = {}) {
  const config = normalizeBridgeConfig(env);
  const errors = [];
  if (!env.SEEDANCE_API_BASE_URL) errors.push('SEEDANCE_API_BASE_URL 必須明確設定。');
  else {
    try {
      const upstream = new URL(env.SEEDANCE_API_BASE_URL);
      if (upstream.protocol !== 'https:') errors.push('SEEDANCE_API_BASE_URL 必須使用 HTTPS。');
    } catch { errors.push('SEEDANCE_API_BASE_URL 必須是有效 URL。'); }
  }
  if (!config.allowedOrigins.length) errors.push('SEEDANCE_ALLOWED_ORIGINS 不可為空。');
  if (config.invalidOrigins.length) errors.push(`SEEDANCE_ALLOWED_ORIGINS 含無效 origin：${config.invalidOrigins.join(', ')}`);
  if (config.allowedOrigins.some((origin) => !validHttpsOrigin(origin))) errors.push('正式環境 allowed origin 必須使用 HTTPS。');
  if (config.bindHost === '127.0.0.1' || config.bindHost === 'localhost' || config.bindHost === '::1') errors.push('正式環境 SEEDANCE_BIND_HOST 不可只綁定 localhost。');
  if (!config.requireOrigin) errors.push('正式環境必須設定 SEEDANCE_REQUIRE_ORIGIN=true。');
  return { ok: errors.length === 0, config, errors };
}

export function originDecision(origin, config) {
  const requestOrigin = String(origin || '').trim();
  if (!requestOrigin) return { allowed: !config.requireOrigin, reason: config.requireOrigin ? 'ORIGIN_REQUIRED' : '' };
  if (!config.allowedOrigins.length) return { allowed: true, reason: '' };
  return config.allowedOrigins.includes(requestOrigin) ? { allowed: true, reason: '' } : { allowed: false, reason: 'ORIGIN_NOT_ALLOWED' };
}

export function createRateLimiter(limitPerMinute, now = () => Date.now()) {
  const limit = Math.min(RATE_LIMIT_MAX, Math.max(RATE_LIMIT_MIN, Math.round(Number(limitPerMinute) || DEFAULT_BRIDGE_CONFIG.rateLimitPerMinute)));
  const buckets = new Map();
  return {
    consume(key = 'unknown') {
      const timestamp = now();
      if (buckets.size > 1000) {
        for (const [bucketKey, bucket] of buckets) {
          if (timestamp - bucket.startedAt >= 60_000) buckets.delete(bucketKey);
        }
      }
      const existing = buckets.get(key);
      if (!existing || timestamp - existing.startedAt >= 60_000) {
        buckets.set(key, { startedAt: timestamp, count: 1 });
        return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
      }
      if (existing.count >= limit) {
        return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((60_000 - (timestamp - existing.startedAt)) / 1000)) };
      }
      existing.count += 1;
      return { allowed: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
    },
    clear() { buckets.clear(); },
  };
}
