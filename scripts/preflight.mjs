import { validateProductionBridgeConfig } from '../src/bridge-policy.mjs';

const result = validateProductionBridgeConfig(process.env);
const strict = process.argv.includes('--strict');
const report = {
  status: result.ok ? 'READY' : 'NOT_READY',
  strict,
  checks: {
    upstream: result.config.allowedOrigins.length > 0 && Boolean(process.env.SEEDANCE_API_BASE_URL),
    originAllowlist: result.config.allowedOrigins.length > 0 && result.config.invalidOrigins.length === 0,
    bindHost: !['127.0.0.1', 'localhost', '::1'].includes(result.config.bindHost),
    requireOrigin: result.config.requireOrigin,
    rateLimitPerMinute: result.config.rateLimitPerMinute,
  },
  errors: result.errors,
};
console.log(JSON.stringify(report, null, 2));
if (strict && !result.ok) process.exitCode = 1;
