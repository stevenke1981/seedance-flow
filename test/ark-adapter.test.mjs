import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { cancelGenerationTask, createGenerationTask, getGenerationTask, normalizeGenerationTask } from '../src/ark-adapter.mjs';
import { createApiHandler } from '../scripts/api-server.mjs';

function responseJson(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

test('Ark adapter creates a task with official content-generation shape', async () => {
  const calls = [];
  const result = await createGenerationTask({ apiKey: 'device-only-key', model: 'seedance-endpoint', prompt: '一隻貓在窗邊抬頭', ratio: '16:9', duration: 5 }, {
    baseUrl: 'https://ark.example.test/api/v3',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return responseJson({ id: 'cgt-test-001' });
    },
  });
  assert.equal(result.id, 'cgt-test-001');
  assert.equal(calls[0].url, 'https://ark.example.test/api/v3/contents/generations/tasks');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer device-only-key');
  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.model, 'seedance-endpoint');
  assert.match(payload.content[0].text, /--ratio 16:9 --dur 5/);
  assert.equal(payload.return_last_frame, true);
});

test('Ark adapter appends HTTPS reference images as image_url content', async () => {
  let payload;
  await createGenerationTask({ apiKey: 'device-only-key', model: 'seedance-endpoint', prompt: '保持角色一致', ratio: '16:9', duration: 5, referenceImages: ['https://cdn.example/reference.png', 'https://cdn.example/last-frame.png'] }, {
    baseUrl: 'https://ark.example.test/api/v3',
    fetchImpl: async (_url, options) => { payload = JSON.parse(options.body); return responseJson({ id: 'cgt-test-image-001' }); },
  });
  assert.deepEqual(payload.content.slice(1), [
    { type: 'image_url', image_url: { url: 'https://cdn.example/reference.png' } },
    { type: 'image_url', image_url: { url: 'https://cdn.example/last-frame.png' } },
  ]);
});

test('Ark adapter rejects local and excessive reference URLs', async () => {
  const input = { apiKey: 'device-only-key', model: 'seedance-endpoint', prompt: 'test', ratio: '16:9', duration: 5 };
  await assert.rejects(() => createGenerationTask({ ...input, referenceImages: ['blob:http://localhost/image'] }), (error) => error.status === 400 && /HTTPS/.test(error.message));
  await assert.rejects(() => createGenerationTask({ ...input, referenceImages: ['https://a.test/1', 'https://a.test/2', 'https://a.test/3', 'https://a.test/4'] }), (error) => error.status === 400 && /最多附加 3 張/.test(error.message));
});

test('Ark adapter normalizes terminal task and video URL', () => {
  const task = normalizeGenerationTask({ id: 'cgt-test-002', model: 'seedance-endpoint', status: 'succeeded', content: { video_url: 'https://cdn.example/video.mp4', last_frame_url: 'https://cdn.example/frame.png' }, usage: { total_tokens: 42 } });
  assert.deepEqual(task, { id: 'cgt-test-002', model: 'seedance-endpoint', status: 'succeeded', videoUrl: 'https://cdn.example/video.mp4', lastFrameUrl: 'https://cdn.example/frame.png', error: null, requestId: '', usage: { total_tokens: 42 }, createdAt: null, updatedAt: null, seed: null, terminal: true });
});

test('local API proxy never returns or persists the API key', async () => {
  const calls = [];
  const handleApi = createApiHandler({ baseUrl: 'https://ark.example.test/api/v3', fetchImpl: async (url, options) => { calls.push({ url, options }); return responseJson({ id: 'cgt-test-003' }); } });
  const request = Readable.from([Buffer.from(JSON.stringify({ model: 'seedance-endpoint', prompt: 'test', ratio: '16:9', duration: 5 }))]);
  request.method = 'POST';
  request.headers = { 'x-ark-api-key': 'secret-that-must-not-echo' };
  let responseBody = '';
  let responseStatus = 0;
  const response = { writeHead(status) { responseStatus = status; }, end(body) { responseBody = body; } };
  await handleApi(request, response, '/api/generations');
  assert.equal(responseStatus, 202);
  assert.deepEqual(JSON.parse(responseBody), { id: 'cgt-test-003', model: 'seedance-endpoint', status: 'queued' });
  assert.equal(calls.length, 1);
  assert.match(calls[0].options.headers.Authorization, /^Bearer secret-that-must-not-echo$/);
  assert.doesNotMatch(responseBody, /secret-that-must-not-echo/);
});

test('local API proxy returns structured validation errors and supports cancellation', async () => {
  const handleApi = createApiHandler({ baseUrl: 'https://ark.example.test/api/v3', fetchImpl: async (_url, options) => {
    assert.equal(options.method, 'DELETE');
    return responseJson({ status: 'cancelled' });
  } });
  const missingKeyRequest = Readable.from([Buffer.from(JSON.stringify({ model: 'seedance-endpoint', prompt: 'test', ratio: '16:9', duration: 5 }))]);
  missingKeyRequest.method = 'POST';
  missingKeyRequest.headers = {};
  let missingKeyBody = '';
  let missingKeyStatus = 0;
  await handleApi(missingKeyRequest, { writeHead(status) { missingKeyStatus = status; }, end(body) { missingKeyBody = body; } }, '/api/generations');
  assert.equal(missingKeyStatus, 400);
  assert.equal(JSON.parse(missingKeyBody).error.code, 'SEEDANCE_API_ERROR');

  const cancelRequest = Readable.from([]);
  cancelRequest.method = 'DELETE';
  cancelRequest.headers = { 'x-ark-api-key': 'device-only-key' };
  let cancelBody = '';
  let cancelStatus = 0;
  await handleApi(cancelRequest, { writeHead(status) { cancelStatus = status; }, end(body) { cancelBody = body; } }, '/api/generations/cgt-test-006');
  assert.equal(cancelStatus, 200);
  assert.equal(JSON.parse(cancelBody).status, 'cancelled');
});

test('task polling maps API errors to a structured adapter error', async () => {
  await assert.rejects(() => getGenerationTask('cgt-test-004', 'device-only-key', { baseUrl: 'https://ark.example.test/api/v3', fetchImpl: async () => responseJson({ error: { code: 'QuotaExceeded', message: 'quota' } }, 429) }), (error) => error.status === 429 && error.code === 'QuotaExceeded');
});

test('adapter maps upstream timeout to a retryable 504', async () => {
  await assert.rejects(() => createGenerationTask({ apiKey: 'device-only-key', model: 'seedance-endpoint', prompt: 'test', ratio: '16:9', duration: 5 }, {
    timeoutMs: 1000,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true })),
  }), (error) => error.status === 504 && error.code === 'REQUEST_TIMEOUT' && error.retryable === true);
});

test('adapter cancels a generation task with DELETE', async () => {
  const calls = [];
  const result = await cancelGenerationTask('cgt-test-005', 'device-only-key', {
    baseUrl: 'https://ark.example.test/api/v3',
    fetchImpl: async (url, options) => { calls.push({ url, options }); return responseJson({ status: 'cancelled' }); },
  });
  assert.equal(result.id, 'cgt-test-005');
  assert.equal(result.status, 'cancelled');
  assert.equal(calls[0].options.method, 'DELETE');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer device-only-key');
});
