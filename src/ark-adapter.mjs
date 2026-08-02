export const DEFAULT_ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
export const DEFAULT_REQUEST_TIMEOUT_MS = 45_000;
export const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'expired', 'cancelled']);
export const ALLOWED_RATIOS = new Set(['16:9', '9:16', '1:1', '4:3']);

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function invalidInput(message) {
  return Object.assign(new Error(message), { status: 400 });
}

export function validateGenerationInput(input = {}) {
  const apiKey = trimString(input.apiKey);
  const model = trimString(input.model);
  const prompt = trimString(input.prompt);
  const ratio = trimString(input.ratio) || '16:9';
  const duration = Number(input.duration);
  if (!apiKey) throw invalidInput('請先在 API 設定輸入 Ark API Key；金鑰只會留在目前分頁記憶體。');
  if (!model) throw invalidInput('請填寫 Seedance 模型或 Endpoint ID。');
  if (!prompt) throw invalidInput('提示詞不可為空白。');
  if (prompt.length > 10000) throw invalidInput('提示詞過長（上限 10,000 字元）。');
  if (!ALLOWED_RATIOS.has(ratio)) throw invalidInput('不支援的畫面比例。');
  if (!Number.isFinite(duration) || duration < 1 || duration > 180) throw invalidInput('時長必須介於 1 到 180 秒。');
  return { apiKey, model, prompt, ratio, duration: Math.round(duration), generateAudio: input.generateAudio === true };
}

function headers(apiKey) {
  return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
}

function endpoint(baseUrl, suffix = '') {
  return `${String(baseUrl || DEFAULT_ARK_BASE_URL).replace(/\/$/, '')}/contents/generations/tasks${suffix}`;
}

function requestContext(options = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1_000, options.timeoutMs) : DEFAULT_REQUEST_TIMEOUT_MS;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const upstreamSignal = options.signal;
  const abortFromCaller = () => controller.abort();
  if (upstreamSignal) {
    if (upstreamSignal.aborted) controller.abort();
    else upstreamSignal.addEventListener('abort', abortFromCaller, { once: true });
  }
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      upstreamSignal?.removeEventListener('abort', abortFromCaller);
    },
  };
}

function isRetryableStatus(status) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

async function parseResponse(response) {
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { raw }; }
  if (!response.ok) {
    const error = new Error(body?.error?.message || body?.message || `Seedance API 回應 ${response.status}`);
    error.status = response.status;
    error.code = body?.error?.code;
    error.requestId = body?.request_id || body?.error?.request_id || response.headers?.get?.('x-request-id') || response.headers?.get?.('x-tt-logid') || '';
    error.retryable = isRetryableStatus(response.status);
    throw error;
  }
  return body;
}

async function requestJson(fetchImpl, url, init, options = {}) {
  const context = requestContext(options);
  try {
    const response = await fetchImpl(url, { ...init, signal: context.signal });
    return await parseResponse(response);
  } catch (error) {
    if (context.timedOut()) {
      throw Object.assign(new Error('Seedance API 請求逾時，請稍後重試。'), { status: 504, code: 'REQUEST_TIMEOUT', retryable: true });
    }
    if (error?.name === 'AbortError') {
      throw Object.assign(new Error('Seedance API 請求已取消。'), { status: 499, code: 'REQUEST_ABORTED', retryable: false });
    }
    if (error?.status) throw error;
    throw Object.assign(new Error('無法連線到 Seedance API，請檢查網路或本機代理。'), { status: 502, code: 'UPSTREAM_NETWORK_ERROR', retryable: true, cause: error });
  } finally {
    context.cleanup();
  }
}

export async function createGenerationTask(input, options = {}) {
  const validated = validateGenerationInput(input);
  const fetchImpl = options.fetchImpl || fetch;
  const baseUrl = options.baseUrl || DEFAULT_ARK_BASE_URL;
  const promptWithControls = `${validated.prompt}\n\n--ratio ${validated.ratio} --dur ${validated.duration}`;
  const content = [{ type: 'text', text: promptWithControls }];
  const body = await requestJson(fetchImpl, endpoint(baseUrl), {
    method: 'POST',
    headers: headers(validated.apiKey),
    body: JSON.stringify({ model: validated.model, content, return_last_frame: true }),
  }, options);
  if (!body.id || typeof body.id !== 'string') throw new Error('Seedance API 未回傳任務 ID。');
  return { id: body.id, model: validated.model, status: 'queued' };
}

export async function getGenerationTask(taskId, apiKey, options = {}) {
  const id = trimString(taskId);
  const key = trimString(apiKey);
  if (!id) throw invalidInput('缺少任務 ID。');
  if (!key) throw invalidInput('查詢任務需要 Ark API Key。');
  const fetchImpl = options.fetchImpl || fetch;
  const baseUrl = options.baseUrl || DEFAULT_ARK_BASE_URL;
  const body = await requestJson(fetchImpl, endpoint(baseUrl, `/${encodeURIComponent(id)}`), { headers: headers(key) }, options);
  return normalizeGenerationTask(body);
}

export async function cancelGenerationTask(taskId, apiKey, options = {}) {
  const id = trimString(taskId);
  const key = trimString(apiKey);
  if (!id) throw invalidInput('取消任務需要任務 ID。');
  if (!key) throw invalidInput('取消任務需要 Ark API Key。');
  const fetchImpl = options.fetchImpl || fetch;
  const baseUrl = options.baseUrl || DEFAULT_ARK_BASE_URL;
  const body = await requestJson(fetchImpl, endpoint(baseUrl, `/${encodeURIComponent(id)}`), { method: 'DELETE', headers: headers(key) }, options);
  return body && typeof body === 'object' ? normalizeGenerationTask({ id, status: 'cancelled', ...body }) : { id, status: 'cancelled', terminal: true };
}

export function normalizeGenerationTask(body = {}) {
  const content = body.content && typeof body.content === 'object' ? body.content : {};
  const status = trimString(body.status) || 'queued';
  return {
    id: trimString(body.id),
    model: trimString(body.model),
    status,
    videoUrl: trimString(content.video_url || content.videoUrl),
    lastFrameUrl: trimString(content.last_frame_url || content.lastFrameUrl),
    error: body.error ? { code: trimString(body.error.code), message: trimString(body.error.message) } : null,
    requestId: trimString(body.request_id || body.requestId),
    usage: body.usage || null,
    createdAt: body.created_at || null,
    updatedAt: body.updated_at || null,
    seed: body.seed ?? null,
    terminal: TERMINAL_STATUSES.has(status),
  };
}
