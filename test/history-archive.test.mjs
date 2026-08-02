import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HISTORY_ARCHIVE_KIND,
  HISTORY_ARCHIVE_SCHEMA_VERSION,
  mergeHistoryEntries,
  parseHistoryArchive,
  serializeHistoryArchive,
} from '../src/history-archive.mjs';

const entry = {
  id: 'generation-1',
  version: 'v001',
  prompt: '一個人在雨夜奔跑',
  status: 'succeeded',
  videoUrl: 'https://cdn.example/video.mp4',
  workflow: { nodes: [{ id: 'scene-1', type: 'scene', apiKey: 'nested-secret' }], token: 'nested-token' },
  usage: { authorization: 'nested-auth', 'X-Ark-Api-Key': 'nested-key', SEEDANCE_API_KEY: 'env-key', accessToken: 'access-token', input_tokens: 5, output_tokens: 8, total_tokens: 13, durationSeconds: 10 },
  apiKey: 'must-not-export',
};

test('history archive round-trips a safe allowlist without API keys', () => {
  const serialized = serializeHistoryArchive([entry], '2026-08-02T00:00:00.000Z');
  const payload = JSON.parse(serialized);
  assert.equal(payload.schemaVersion, HISTORY_ARCHIVE_SCHEMA_VERSION);
  assert.equal(payload.kind, HISTORY_ARCHIVE_KIND);
  assert.equal(payload.exportedAt, '2026-08-02T00:00:00.000Z');
  assert.equal(payload.entries[0].apiKey, undefined);
  assert.equal(payload.entries[0].workflow.token, undefined);
  assert.equal(payload.entries[0].workflow.nodes[0].apiKey, undefined);
  assert.equal(payload.entries[0].usage.authorization, undefined);
  assert.equal(payload.entries[0].usage['X-Ark-Api-Key'], undefined);
  assert.equal(payload.entries[0].usage.SEEDANCE_API_KEY, undefined);
  assert.equal(payload.entries[0].usage.accessToken, undefined);
  assert.equal(payload.entries[0].usage.input_tokens, 5);
  assert.equal(payload.entries[0].usage.output_tokens, 8);
  assert.equal(payload.entries[0].usage.total_tokens, 13);
  assert.deepEqual(parseHistoryArchive(serialized), [payload.entries[0]]);
  const importedRaw = parseHistoryArchive(JSON.stringify({ schemaVersion: 1, kind: HISTORY_ARCHIVE_KIND, entries: [{ id: 'raw', apiKey: 'raw-secret', workflow: { accessToken: 'raw-token' } }] }));
  assert.equal(importedRaw[0].apiKey, undefined);
  assert.equal(importedRaw[0].workflow.accessToken, undefined);
});

test('history archive rejects incompatible or oversized input', () => {
  assert.throws(() => parseHistoryArchive(JSON.stringify({ schemaVersion: 1, kind: 'other', entries: [] })), /不相容/);
  assert.throws(() => parseHistoryArchive(JSON.stringify({ schemaVersion: 1, kind: HISTORY_ARCHIVE_KIND, entries: Array.from({ length: 41 }, () => entry) })), /不可超過 40/);
  assert.throws(() => parseHistoryArchive(JSON.stringify({ schemaVersion: 1, kind: HISTORY_ARCHIVE_KIND, entries: [{ prompt: 'missing id' }] })), /缺少 id/);
  assert.throws(() => serializeHistoryArchive([{ id: 'large', prompt: 'x'.repeat(2_000_000) }]), /不可超過 2000000 bytes/);
});

test('history merge prefers imported entries and removes duplicate ids', () => {
  const merged = mergeHistoryEntries([{ id: 'same', version: 'v001' }, { id: 'old', version: 'v000' }], [{ id: 'same', version: 'v009' }, { id: 'new', version: 'v010' }]);
  assert.deepEqual(merged.map((item) => item.id), ['same', 'new', 'old']);
  assert.equal(merged[0].version, 'v009');
});
