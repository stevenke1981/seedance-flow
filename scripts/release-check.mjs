import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProductionBridgeConfig } from '../src/bridge-policy.mjs';

export const REQUIRED_RELEASE_FILES = Object.freeze([
  'dist/index.html',
  'dist/styles.css',
  'dist/output/imagegen/node-icons-sprite.png',
  'dist/src/app.js',
  'dist/src/prompt-engine.mjs',
  'dist/src/ark-adapter.mjs',
  'dist/src/generation-policy.mjs',
  'dist/src/bridge-policy.mjs',
  'dist/src/history-archive.mjs',
  'dist/src/history-filter.mjs',
  'dist/src/node-hover-preview.mjs',
]);

async function artifactInfo(root, relativePath) {
  try {
    const body = await readFile(join(root, relativePath));
    return { path: relativePath, bytes: body.byteLength, sha256: createHash('sha256').update(body).digest('hex') };
  } catch {
    return null;
  }
}

export async function buildReleaseReport({ root = fileURLToPath(new URL('..', import.meta.url)), env = process.env, strict = false } = {}) {
  const artifacts = (await Promise.all(REQUIRED_RELEASE_FILES.map((relativePath) => artifactInfo(root, relativePath)))).filter(Boolean);
  const preflight = validateProductionBridgeConfig(env);
  const missing = REQUIRED_RELEASE_FILES.filter((relativePath) => !artifacts.some((artifact) => artifact.path === relativePath));
  const errors = [];
  if (missing.length) errors.push(`缺少 release 產物：${missing.join(', ')}`);
  if (strict && !preflight.ok) errors.push(...preflight.errors);
  return {
    status: errors.length ? 'NOT_READY' : 'READY',
    strict,
    artifacts,
    artifactCount: artifacts.length,
    preflight: { status: preflight.ok ? 'READY' : 'NOT_READY', errors: preflight.errors },
    errors,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const strict = process.argv.includes('--strict');
  const report = await buildReleaseReport({ strict });
  console.log(JSON.stringify(report, null, 2));
  if (strict && report.status !== 'READY') process.exitCode = 1;
}
