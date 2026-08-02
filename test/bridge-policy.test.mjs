import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter, normalizeBridgeConfig, originDecision, validateProductionBridgeConfig } from '../src/bridge-policy.mjs';

test('bridge policy normalizes origins and local defaults', () => {
  const config = normalizeBridgeConfig({ SEEDANCE_ALLOWED_ORIGINS: 'https://app.example, https://app.example/ ', SEEDANCE_RATE_LIMIT_PER_MINUTE: '7', SEEDANCE_REQUIRE_ORIGIN: 'true' });
  assert.deepEqual(config.allowedOrigins, ['https://app.example']);
  assert.equal(config.rateLimitPerMinute, 7);
  assert.equal(config.requireOrigin, true);
  assert.deepEqual(originDecision('https://app.example', config), { allowed: true, reason: '' });
  assert.deepEqual(originDecision('https://evil.example', config), { allowed: false, reason: 'ORIGIN_NOT_ALLOWED' });
  assert.deepEqual(originDecision('', config), { allowed: false, reason: 'ORIGIN_REQUIRED' });
});

test('production bridge preflight requires explicit secure deployment settings', () => {
  const notReady = validateProductionBridgeConfig({});
  assert.equal(notReady.ok, false);
  assert.ok(notReady.errors.length >= 4);
  const ready = validateProductionBridgeConfig({
    SEEDANCE_API_BASE_URL: 'https://ark.example.test/api/v3',
    SEEDANCE_ALLOWED_ORIGINS: 'https://app.example',
    SEEDANCE_BIND_HOST: '0.0.0.0',
    SEEDANCE_REQUIRE_ORIGIN: 'true',
    SEEDANCE_RATE_LIMIT_PER_MINUTE: '60',
  });
  assert.equal(ready.ok, true);
  assert.equal(ready.errors.length, 0);
});

test('rate limiter returns retry information and resets the window', () => {
  let now = 0;
  const limiter = createRateLimiter(2, () => now);
  assert.equal(limiter.consume('client').allowed, true);
  assert.equal(limiter.consume('client').allowed, true);
  const blocked = limiter.consume('client');
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 1);
  now = 60_000;
  assert.equal(limiter.consume('client').allowed, true);
});
