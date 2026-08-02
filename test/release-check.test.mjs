import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildReleaseReport, REQUIRED_RELEASE_FILES } from '../scripts/release-check.mjs';

const readyEnv = {
  SEEDANCE_API_BASE_URL: 'https://ark.example.test/api/v3',
  SEEDANCE_ALLOWED_ORIGINS: 'https://app.example',
  SEEDANCE_BIND_HOST: '0.0.0.0',
  SEEDANCE_REQUIRE_ORIGIN: 'true',
  SEEDANCE_RATE_LIMIT_PER_MINUTE: '60',
};

test('release check reports hashed artifacts and strict readiness', async () => {
  const root = await mkdtemp(join(tmpdir(), 'seedance-release-'));
  try {
    for (const relativePath of REQUIRED_RELEASE_FILES) {
      const target = join(root, relativePath);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, `artifact:${relativePath}`);
    }
    const report = await buildReleaseReport({ root, env: readyEnv, strict: true });
    assert.equal(report.status, 'READY');
    assert.equal(report.artifactCount, REQUIRED_RELEASE_FILES.length);
    assert.match(report.artifacts[0].sha256, /^[a-f0-9]{64}$/);
    assert.equal(report.preflight.status, 'READY');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('release check rejects missing artifacts in strict mode', async () => {
  const root = await mkdtemp(join(tmpdir(), 'seedance-release-missing-'));
  try {
    const report = await buildReleaseReport({ root, env: readyEnv, strict: true });
    assert.equal(report.status, 'NOT_READY');
    assert.match(report.errors[0], /缺少 release 產物/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
