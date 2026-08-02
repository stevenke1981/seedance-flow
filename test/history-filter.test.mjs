import test from 'node:test';
import assert from 'node:assert/strict';
import { filterHistory, HISTORY_FILTER_STATUSES } from '../src/history-filter.mjs';

const entries = [
  { id: '1', version: 'v001', status: 'succeeded', model: 'seedance-pro', prompt: '雨夜郵差穿過霓虹巷口', requestId: 'req-a' },
  { id: '2', version: 'v002', status: 'failed', model: 'seedance-fast', prompt: '海邊日出', errorMessage: 'timeout', errorCode: 'REQUEST_TIMEOUT' },
  { id: '3', version: 'v003', status: 'running', model: 'seedance-pro', prompt: '雨夜列車', requestId: 'req-c' },
];

test('history filter matches query across version, prompt and model', () => {
  assert.deepEqual(filterHistory(entries, { query: '雨夜' }).map((entry) => entry.id), ['1', '3']);
  assert.deepEqual(filterHistory(entries, { query: 'V002' }).map((entry) => entry.id), ['2']);
  assert.deepEqual(filterHistory(entries, { query: 'FAST' }).map((entry) => entry.id), ['2']);
  assert.deepEqual(filterHistory(entries, { query: 'request_timeout' }).map((entry) => entry.id), ['2']);
});

test('history filter applies status independently and preserves order', () => {
  assert.deepEqual(filterHistory(entries, { status: 'succeeded' }).map((entry) => entry.id), ['1']);
  assert.deepEqual(filterHistory(entries, { query: 'req', status: 'running' }).map((entry) => entry.id), ['3']);
  assert.deepEqual(filterHistory(entries, { status: 'invalid' }).map((entry) => entry.id), ['1', '2', '3']);
  assert.deepEqual(HISTORY_FILTER_STATUSES.slice(0, 3), ['all', 'queued', 'running']);
});

test('history filter handles empty or malformed collections without mutation', () => {
  assert.deepEqual(filterHistory([], { query: 'anything' }), []);
  assert.deepEqual(filterHistory([null, 'bad', entries[0]], { query: '雨夜' }).map((entry) => entry.id), ['1']);
  assert.equal(entries.length, 3);
});
