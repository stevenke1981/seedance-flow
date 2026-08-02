import {
  STORAGE_KEY,
  NODE_LIBRARY,
  beatLines,
  buildPrompt,
  createDefaultWorkflow,
  createNode,
  fieldsFor,
  parseWorkflow,
  serializeWorkflow,
} from './prompt-engine.mjs';
import {
  DEFAULT_GENERATION_POLICY,
  POLICY_STORAGE_KEY,
  evaluateGenerationPolicy,
  normalizeGenerationPolicy,
  summarizeDailyUsage,
} from './generation-policy.mjs';

const HISTORY_KEY = 'seedance-flow-history-v1';
const STATUS_LABELS = { queued: '排隊中', running: '生成中', cancelling: '取消中', succeeded: '已完成', failed: '失敗', expired: '已過期', cancelled: '已取消' };
const MAX_HISTORY = 40;
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_MS = 15 * 60 * 1000;
const MAX_POLL_RETRIES = 3;

const $ = (selector) => document.querySelector(selector);
const canvas = $('#canvas');
const edgeLayer = $('#edge-layer');
const promptOutput = $('#prompt-output');
const actionStatus = $('#action-status');
const saveState = $('#save-state');
const inspectorForm = $('#inspector-form');
const inspectorTitle = $('#inspector-title');
const selectedChip = $('#selected-chip');
const deleteButton = $('#delete-node');
const nodeCount = $('#node-count');
const zoomLevel = $('#zoom-level');
const viewport = $('#canvas-viewport');
const apiModal = $('#api-modal');
const apiKeyInput = $('#ark-api-key');
const modelInput = $('#ark-model');
const policyMaxDurationInput = $('#policy-max-duration');
const policyDailyTasksInput = $('#policy-daily-tasks');
const policyDailyDurationInput = $('#policy-daily-duration');
const policyConfirmationInput = $('#policy-confirmation');
const versionHistory = $('#version-history');
const historyCount = $('#history-count');
const generateButton = $('#generate-video');

let workflow = loadWorkflow();
let selectedId = workflow.nodes[0]?.id || null;
let zoom = 1;
let dragState = null;
let saveTimer;
let apiConfig = { apiKey: '', model: '' };
let generationPolicy = loadGenerationPolicy();
let history = loadHistory();
const pollTimers = new Map();
const submitting = new Set();
const assetPreviews = new Map();

function loadWorkflow() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return parseWorkflow(raw);
  } catch (error) {
    console.warn('Unable to restore local workflow', error);
  }
  return createDefaultWorkflow();
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY).map(normalizeHistoryEntry).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function loadGenerationPolicy() {
  try {
    const raw = localStorage.getItem(POLICY_STORAGE_KEY);
    return normalizeGenerationPolicy(raw ? JSON.parse(raw) : DEFAULT_GENERATION_POLICY);
  } catch {
    return normalizeGenerationPolicy(DEFAULT_GENERATION_POLICY);
  }
}

function persistGenerationPolicy() {
  try { localStorage.setItem(POLICY_STORAGE_KEY, JSON.stringify(generationPolicy)); } catch { announce('用量護欄無法寫入本機儲存。', 'error'); }
}

function normalizeGuardrailSnapshot(value) {
  if (!value || typeof value !== 'object') return null;
  const usage = value.usageBefore && typeof value.usageBefore === 'object' ? value.usageBefore : {};
  return {
    policy: normalizeGenerationPolicy(value.policy),
    usageBefore: {
      date: typeof usage.date === 'string' ? usage.date.slice(0, 16) : '',
      taskCount: Number.isFinite(usage.taskCount) ? Math.max(0, Math.round(usage.taskCount)) : 0,
      durationSeconds: Number.isFinite(usage.durationSeconds) ? Math.max(0, Math.round(usage.durationSeconds)) : 0,
    },
  };
}

function normalizeHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' || entry.id.length > 160) return null;
  const status = ['queued', 'running', 'cancelling', 'succeeded', 'failed', 'expired', 'cancelled'].includes(entry.status) ? entry.status : 'failed';
  return {
    id: entry.id,
    version: typeof entry.version === 'string' ? entry.version.slice(0, 32) : 'v???',
    prompt: typeof entry.prompt === 'string' ? entry.prompt.slice(0, 10000) : '',
    promptHash: typeof entry.promptHash === 'string' ? entry.promptHash.slice(0, 64) : '',
    model: typeof entry.model === 'string' ? entry.model.slice(0, 200) : '',
    ratio: typeof entry.ratio === 'string' ? entry.ratio.slice(0, 20) : '16:9',
    duration: Number.isFinite(entry.duration) ? entry.duration : 30,
    referenceImages: Array.isArray(entry.referenceImages) ? entry.referenceImages.filter((url) => typeof url === 'string').slice(0, 3) : [],
    status,
    taskId: typeof entry.taskId === 'string' ? entry.taskId.slice(0, 200) : '',
    videoUrl: typeof entry.videoUrl === 'string' ? entry.videoUrl.slice(0, 2048) : '',
    lastFrameUrl: typeof entry.lastFrameUrl === 'string' ? entry.lastFrameUrl.slice(0, 2048) : '',
    errorMessage: typeof entry.errorMessage === 'string' ? entry.errorMessage.slice(0, 1000) : '',
    errorCode: typeof entry.errorCode === 'string' ? entry.errorCode.slice(0, 120) : '',
    requestId: typeof entry.requestId === 'string' ? entry.requestId.slice(0, 200) : '',
    createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString(),
    updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : '',
    pollStartedAt: typeof entry.pollStartedAt === 'string' ? entry.pollStartedAt : '',
    pollRetries: Number.isFinite(entry.pollRetries) ? Math.max(0, Math.min(MAX_POLL_RETRIES, entry.pollRetries)) : 0,
    retryOf: typeof entry.retryOf === 'string' ? entry.retryOf.slice(0, 32) : '',
    usage: entry.usage && typeof entry.usage === 'object' ? entry.usage : null,
    guardrail: normalizeGuardrailSnapshot(entry.guardrail),
    workflow: entry.workflow && typeof entry.workflow === 'object' ? entry.workflow : null,
  };
}

function persistHistory() {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY))); } catch { announce('版本歷史無法寫入本機儲存。', 'error'); }
}

function nextVersion() {
  const numbers = history.map((entry) => Number(String(entry.version || '').replace(/^v/, ''))).filter(Number.isFinite);
  return `v${String(Math.max(0, ...numbers) + 1).padStart(3, '0')}`;
}

function promptDigest(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function selectedNode() {
  return workflow.nodes.find((node) => node.id === selectedId) || null;
}

function metaFor(node) {
  return NODE_LIBRARY.find((item) => item.type === node.type) || NODE_LIBRARY[0];
}

function previewFor(node) {
  const fields = fieldsFor(node.type);
  const firstValue = fields.map((field) => node.values?.[field.key]).find((value) => typeof value === 'string' && value.trim());
  return firstValue || '尚未填寫，選取節點以編輯。';
}

function announce(message, tone = 'success') {
  actionStatus.textContent = message;
  actionStatus.dataset.tone = tone;
  window.clearTimeout(announce.timer);
  announce.timer = window.setTimeout(() => { actionStatus.textContent = ''; }, 4200);
}

function persist() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workflow));
      saveState.textContent = 'LOCAL DRAFT · SAVED';
    } catch {
      saveState.textContent = 'LOCAL DRAFT · BLOCKED';
      announce('瀏覽器未允許本地儲存；本次仍可繼續編輯。', 'error');
    }
  }, 160);
  saveState.textContent = 'LOCAL DRAFT · SAVING…';
}

function renderLibrary() {
  const library = $('#node-library');
  library.replaceChildren();
  NODE_LIBRARY.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `library-item accent-${item.accent}`;
    button.dataset.addNode = item.type;
    button.setAttribute('aria-label', `新增 ${item.title} 節點`);
    button.innerHTML = `<span class="library-icon">${item.icon}</span><span class="library-copy"><span class="library-title">${item.title}</span><span class="library-subtitle">${item.subtitle}</span></span><span class="library-add" aria-hidden="true">＋</span>`;
    library.append(button);
  });
}

function renderCanvas() {
  canvas.querySelectorAll('.flow-node').forEach((node) => node.remove());
  workflow.nodes.forEach((node) => {
    const meta = metaFor(node);
    const article = document.createElement('article');
    article.className = `flow-node accent-${meta.accent}${node.id === selectedId ? ' is-selected' : ''}`;
    article.dataset.nodeId = node.id;
    article.style.left = `${Math.round(node.x)}px`;
    article.style.top = `${Math.round(node.y)}px`;
    article.setAttribute('aria-label', `${meta.title} 節點`);
    article.innerHTML = `<div class="node-head" data-drag-handle="true"><span class="node-icon">${meta.icon}</span><span class="node-head-copy"><span class="node-title">${meta.title}</span><span class="node-subtitle">${meta.subtitle}</span></span><span class="node-menu" aria-hidden="true">⋯</span></div><div class="node-body"><div class="node-preview"></div><div class="node-footer"><span>${fieldsFor(node.type).length} CONTROLS</span><span class="node-port" aria-hidden="true"></span></div></div>`;
    article.querySelector('.node-preview').textContent = previewFor(node);
    canvas.append(article);
  });
  nodeCount.textContent = String(workflow.nodes.length).padStart(2, '0');
  requestAnimationFrame(renderEdges);
}

function renderEdges() {
  const ordered = workflow.nodes.filter((node) => canvas.querySelector(`[data-node-id="${CSS.escape(node.id)}"]`));
  const width = Math.max(canvas.clientWidth, 860);
  const height = Math.max(canvas.clientHeight, 720);
  edgeLayer.setAttribute('viewBox', `0 0 ${width} ${height}`);
  edgeLayer.replaceChildren();
  ordered.slice(0, -1).forEach((source, index) => {
    const target = ordered[index + 1];
    const sourceEl = canvas.querySelector(`[data-node-id="${CSS.escape(source.id)}"]`);
    const targetEl = canvas.querySelector(`[data-node-id="${CSS.escape(target.id)}"]`);
    if (!sourceEl || !targetEl) return;
    const sx = source.x + sourceEl.offsetWidth;
    const sy = source.y + Math.min(sourceEl.offsetHeight - 28, 72);
    const tx = target.x;
    const ty = target.y + Math.min(targetEl.offsetHeight - 28, 72);
    const curve = Math.max(34, Math.abs(tx - sx) * .42);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'edge-path');
    path.setAttribute('d', `M ${sx} ${sy} C ${sx + curve} ${sy}, ${tx - curve} ${ty}, ${tx} ${ty}`);
    edgeLayer.append(path);
  });
}

function clearAssetPreview(nodeId) {
  const preview = assetPreviews.get(nodeId);
  if (preview?.url) URL.revokeObjectURL(preview.url);
  assetPreviews.delete(nodeId);
}

function renderAssetPreview(node) {
  const wrapper = document.createElement('div');
  wrapper.className = 'asset-preview';
  const preview = assetPreviews.get(node.id);
  if (!preview) {
    wrapper.textContent = '本機檔案只作預覽；送出前仍需填寫 Ark 可存取的 HTTPS URL。';
    return wrapper;
  }
  const image = document.createElement('img');
  image.src = preview.url;
  image.alt = `${preview.name} 本機預覽`;
  image.loading = 'lazy';
  wrapper.append(image);
  const caption = document.createElement('span');
  caption.textContent = `${preview.name} · ${(preview.size / 1024 / 1024).toFixed(2)} MB`;
  wrapper.append(caption);
  return wrapper;
}

function renderInspector() {
  const node = selectedNode();
  if (!node) {
    inspectorTitle.textContent = '選取一個節點';
    selectedChip.textContent = '—';
    inspectorForm.innerHTML = '<div class="empty-inspector">從畫布選取節點，開始編排提示詞。</div>';
    deleteButton.disabled = true;
    return;
  }
  const meta = metaFor(node);
  inspectorTitle.textContent = meta.title;
  selectedChip.textContent = meta.icon;
  deleteButton.disabled = false;
  inspectorForm.replaceChildren();
  fieldsFor(node.type).forEach((definition) => {
    const field = document.createElement('label');
    field.className = 'field';
    field.dataset.field = definition.key;
    const label = document.createElement('span');
    label.className = 'field-label';
    label.innerHTML = `<span>${definition.label}</span><span class="field-type">${definition.type.toUpperCase()}</span>`;
    field.append(label);
    let input;
    if (definition.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = definition.key === 'beats' ? 4 : 2;
    } else if (definition.type === 'select') {
      input = document.createElement('select');
      definition.options.forEach((option) => {
        const optionEl = document.createElement('option');
        optionEl.value = option;
        optionEl.textContent = option;
        input.append(optionEl);
      });
    } else {
      input = document.createElement('input');
      input.type = 'text';
    }
    input.name = definition.key;
    input.value = node.values?.[definition.key] || '';
    input.placeholder = definition.placeholder || '';
    input.dataset.fieldKey = definition.key;
    field.append(input);
    inspectorForm.append(field);
  });
  if (node.type === 'asset') {
    const uploadField = document.createElement('label');
    uploadField.className = 'field';
    uploadField.innerHTML = '<span class="field-label"><span>本機預覽圖</span><span class="field-type">LOCAL ONLY</span></span>';
    const upload = document.createElement('input');
    upload.type = 'file';
    upload.accept = 'image/png,image/jpeg,image/webp';
    upload.addEventListener('change', () => {
      const file = upload.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        announce('參考資產目前只接受圖片檔。', 'error');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        announce('本機預覽圖不可超過 10 MB。', 'error');
        return;
      }
      clearAssetPreview(node.id);
      assetPreviews.set(node.id, { name: file.name, size: file.size, url: URL.createObjectURL(file) });
      renderInspector();
      announce('本機預覽圖已載入；請另外填寫 HTTPS URL 才能送給 Ark。');
    });
    uploadField.append(upload);
    inspectorForm.append(uploadField, renderAssetPreview(node));
  }
}

function renderOutput() {
  const prompt = buildPrompt(workflow.nodes, workflow);
  promptOutput.textContent = prompt;
  $('#prompt-line-count').textContent = `${prompt.split('\n').length.toString().padStart(2, '0')} LINES`;
  renderTimeline();
}

function renderHistory() {
  historyCount.textContent = String(history.length).padStart(2, '0');
  versionHistory.replaceChildren();
  if (!history.length) {
    versionHistory.innerHTML = '<div class="empty-history">尚未提交影片生成任務。</div>';
    return;
  }
  history.forEach((entry) => {
    const card = document.createElement('article');
    const statusClass = entry.status === 'failed' ? 'is-failed' : (entry.status === 'queued' || entry.status === 'running' || entry.status === 'cancelling' ? 'is-running' : '');
    card.className = `history-item ${statusClass}`;
    card.dataset.historyId = entry.id;
    const head = document.createElement('div');
    head.className = 'history-item-head';
    const version = document.createElement('span');
    version.className = 'history-version';
    version.textContent = entry.version || 'v???';
    const status = document.createElement('span');
    status.className = `history-status ${statusClass}`;
    status.textContent = STATUS_LABELS[entry.status] || entry.status || '未知';
    head.append(version, status);
    card.append(head);
    const time = document.createElement('div');
    time.className = 'history-time';
    time.textContent = `${entry.model || 'Seedance'} · ${new Date(entry.createdAt || Date.now()).toLocaleString('zh-TW', { hour12: false })}`;
    card.append(time);
    const prompt = document.createElement('div');
    prompt.className = 'history-prompt';
    prompt.textContent = entry.prompt || '';
    card.append(prompt);
    if (entry.errorMessage) {
      const error = document.createElement('div');
      error.className = 'history-time';
      error.textContent = [entry.errorMessage, entry.errorCode && `code=${entry.errorCode}`, entry.requestId && `request=${entry.requestId}`].filter(Boolean).join(' · ');
      card.append(error);
    }
    if (entry.videoUrl && /^https?:\/\//i.test(entry.videoUrl)) {
      const video = document.createElement('video');
      video.className = 'history-video';
      video.controls = true;
      video.preload = 'metadata';
      video.src = entry.videoUrl;
      video.setAttribute('aria-label', `${entry.version} 生成影片`);
      card.append(video);
      const links = document.createElement('div');
      links.className = 'history-links';
      const link = document.createElement('a');
      link.className = 'history-link';
      link.href = entry.videoUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = '開啟影片連結 ↗';
      links.append(link);
      card.append(links);
    }
    if (entry.referenceImages?.length) {
      const refs = document.createElement('div');
      refs.className = 'history-time';
      refs.textContent = `參考圖片 ${entry.referenceImages.length} 張`;
      card.append(refs);
    }
    if (entry.guardrail?.usageBefore && entry.guardrail.policy) {
      const guardrail = document.createElement('div');
      guardrail.className = 'history-time';
      guardrail.textContent = `送出前用量：${entry.guardrail.usageBefore.taskCount}/${entry.guardrail.policy.dailyTaskLimit} 次 · ${entry.guardrail.usageBefore.durationSeconds}/${entry.guardrail.policy.dailyDurationLimitSeconds} 秒`;
      card.append(guardrail);
    }
    if (entry.lastFrameUrl && /^https:\/\//i.test(entry.lastFrameUrl)) {
      const frame = document.createElement('img');
      frame.className = 'history-frame';
      frame.src = entry.lastFrameUrl;
      frame.alt = `${entry.version} 影片尾幀`;
      frame.loading = 'lazy';
      card.append(frame);
    }
    const actions = document.createElement('div');
    actions.className = 'history-actions';
    if (['queued', 'running', 'cancelling'].includes(entry.status) && entry.taskId) {
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'button button-danger history-action';
      cancel.dataset.cancelHistory = entry.id;
      cancel.textContent = entry.status === 'cancelling' ? '取消中…' : '取消任務';
      cancel.disabled = entry.status === 'cancelling';
      actions.append(cancel);
    }
    if (['failed', 'succeeded', 'cancelled', 'expired'].includes(entry.status)) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'button button-quiet history-action';
      retry.dataset.retryHistory = entry.id;
      retry.textContent = entry.status === 'succeeded' ? '再次生成' : '重試生成';
      retry.disabled = submitting.has(entry.id);
      actions.append(retry);
    }
    if (entry.lastFrameUrl && /^https:\/\//i.test(entry.lastFrameUrl)) {
      const useFrame = document.createElement('button');
      useFrame.type = 'button';
      useFrame.className = 'button button-quiet history-action';
      useFrame.dataset.useLastFrame = entry.id;
      useFrame.textContent = '用尾幀建立下一段';
      actions.append(useFrame);
    }
    if (actions.childElementCount) card.append(actions);
    versionHistory.append(card);
  });
}

function showApiModal() {
  apiKeyInput.value = apiConfig.apiKey;
  modelInput.value = apiConfig.model;
  policyMaxDurationInput.value = String(generationPolicy.maxDurationSeconds);
  policyDailyTasksInput.value = String(generationPolicy.dailyTaskLimit);
  policyDailyDurationInput.value = String(generationPolicy.dailyDurationLimitSeconds);
  policyConfirmationInput.checked = generationPolicy.requireConfirmation;
  apiModal.hidden = false;
  window.setTimeout(() => (apiConfig.apiKey ? modelInput : apiKeyInput).focus(), 0);
}

function hideApiModal() {
  apiModal.hidden = true;
}

function saveApiConfig() {
  apiConfig = { apiKey: apiKeyInput.value.trim(), model: modelInput.value.trim() };
  generationPolicy = normalizeGenerationPolicy({
    maxDurationSeconds: policyMaxDurationInput.value,
    dailyTaskLimit: policyDailyTasksInput.value,
    dailyDurationLimitSeconds: policyDailyDurationInput.value,
    requireConfirmation: policyConfirmationInput.checked,
  });
  persistGenerationPolicy();
  hideApiModal();
  announce(apiConfig.apiKey && apiConfig.model ? 'API 設定已保留於目前分頁記憶體。' : '請同時填寫 API Key 與模型 ID。', apiConfig.apiKey && apiConfig.model ? 'success' : 'error');
  resumePendingGenerations();
}

function clearApiConfig() {
  apiConfig = { apiKey: '', model: '' };
  apiKeyInput.value = '';
  modelInput.value = '';
  announce('已清除目前分頁的 API 設定。');
}

function generationSettings(sourceWorkflow = workflow) {
  const ratioText = sourceWorkflow.nodes.find((node) => node.type === 'output')?.values?.ratio || sourceWorkflow.ratio || '16:9';
  const durationText = sourceWorkflow.nodes.find((node) => node.type === 'output')?.values?.duration || sourceWorkflow.duration || 30;
  return { ratio: ratioText.match(/\d+:\d+/)?.[0] || '16:9', duration: Number(String(durationText).match(/\d+/)?.[0] || 30) };
}

function generationAssets(sourceWorkflow) {
  const assetNodes = sourceWorkflow.nodes.filter((node) => node.type === 'asset');
  const urls = [];
  assetNodes.forEach((node) => {
    const url = String(node.values?.referenceUrl || '').trim();
    if (!url) throw new Error('參考資產節點缺少 HTTPS URL；本機檔案目前只作預覽，無法直接送給 Ark。');
    try {
      if (new URL(url).protocol !== 'https:') throw new Error('protocol');
    } catch {
      throw new Error('參考資產 URL 必須是 Ark 可存取的 HTTPS 連結。');
    }
    urls.push(url);
  });
  return [...new Set(urls)].slice(0, 3);
}

function apiHeaders() {
  return { 'Content-Type': 'application/json', 'X-Ark-Api-Key': apiConfig.apiKey };
}

async function responseJson(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof body.error === 'string' ? { message: body.error } : (body.error || {});
    const error = new Error(detail.message || `本機 API 回應 ${response.status}`);
    error.status = response.status;
    error.code = detail.code || '';
    error.requestId = detail.requestId || '';
    error.retryable = detail.retryable === true || [408, 409, 425, 429].includes(response.status) || response.status >= 500;
    throw error;
  }
  return body;
}

function clearPoll(entry) {
  const timer = pollTimers.get(entry.id);
  if (timer) window.clearTimeout(timer);
  pollTimers.delete(entry.id);
}

function schedulePoll(entry, delay = POLL_INTERVAL_MS) {
  clearPoll(entry);
  pollTimers.set(entry.id, window.setTimeout(() => {
    pollTimers.delete(entry.id);
    pollGeneration(entry);
  }, delay));
}

function persistEntry(entry) {
  const index = history.findIndex((item) => item.id === entry.id);
  if (index >= 0) history[index] = entry;
  persistHistory();
  renderHistory();
}

function finishGeneration(entry, status, message = '') {
  clearPoll(entry);
  entry.status = status;
  entry.errorMessage = message;
  entry.updatedAt = new Date().toISOString();
  persistEntry(entry);
  const detail = message || STATUS_LABELS[status] || '任務已結束';
  const suffix = /[。.!！?？]$/.test(detail) ? '' : '。';
  announce(status === 'succeeded' ? `${entry.version} 影片已完成，可在版本歷史播放。` : `${entry.version} ${detail}${suffix}`, status === 'succeeded' ? 'success' : 'error');
}

async function pollGeneration(entry) {
  if (!entry.taskId || !apiConfig.apiKey || ['succeeded', 'failed', 'expired', 'cancelled', 'cancelling'].includes(entry.status)) return;
  const startedAt = Date.parse(entry.pollStartedAt || entry.createdAt || '') || Date.now();
  if (!entry.pollStartedAt) entry.pollStartedAt = new Date(startedAt).toISOString();
  if (Date.now() - startedAt > MAX_POLL_MS) {
    finishGeneration(entry, 'expired', '輪詢超過 15 分鐘，已停止自動查詢。');
    return;
  }
  try {
    const response = await fetch(`/api/generations/${encodeURIComponent(entry.taskId)}`, { headers: apiHeaders() });
    const task = await responseJson(response);
    if (entry.status === 'cancelling') return;
    entry.status = task.status || entry.status;
    entry.videoUrl = task.videoUrl || entry.videoUrl || '';
    entry.lastFrameUrl = task.lastFrameUrl || entry.lastFrameUrl || '';
    entry.errorMessage = task.error?.message || '';
    entry.errorCode = task.error?.code || '';
    entry.requestId = task.requestId || entry.requestId || '';
    entry.updatedAt = new Date().toISOString();
    entry.usage = task.usage || entry.usage || null;
    entry.pollRetries = 0;
    persistEntry(entry);
    if (['succeeded', 'failed', 'expired', 'cancelled'].includes(entry.status)) {
      finishGeneration(entry, entry.status, entry.errorMessage);
      return;
    }
    schedulePoll(entry);
  } catch (error) {
    entry.errorCode = error.code || '';
    entry.requestId = error.requestId || '';
    entry.pollRetries = (entry.pollRetries || 0) + 1;
    if (error.retryable && entry.pollRetries <= MAX_POLL_RETRIES && Date.now() - startedAt <= MAX_POLL_MS) {
      const delay = Math.min(POLL_INTERVAL_MS * (2 ** (entry.pollRetries - 1)), 30_000);
      entry.updatedAt = new Date().toISOString();
      persistEntry(entry);
      announce(`${entry.version} 查詢暫時失敗，${Math.round(delay / 1000)} 秒後重試。`, 'error');
      schedulePoll(entry, delay);
      return;
    }
    finishGeneration(entry, 'failed', error.message || '查詢生成任務失敗。');
  }
}

function createGenerationEntry(workflowSnapshot, retryOf = '') {
  const settings = generationSettings(workflowSnapshot);
  const referenceImages = generationAssets(workflowSnapshot);
  const prompt = buildPrompt(workflowSnapshot.nodes, workflowSnapshot).trim();
  const usageBefore = summarizeDailyUsage(history);
  return {
    id: globalThis.crypto?.randomUUID?.() || `local-${Date.now()}`,
    version: nextVersion(),
    prompt,
    promptHash: promptDigest(prompt),
    model: apiConfig.model,
    ratio: settings.ratio,
    duration: settings.duration,
    referenceImages,
    status: 'queued',
    taskId: '',
    videoUrl: '',
    errorMessage: '',
    errorCode: '',
    requestId: '',
    createdAt: new Date().toISOString(),
    updatedAt: '',
    pollStartedAt: '',
    pollRetries: 0,
    retryOf,
    guardrail: { policy: generationPolicy, usageBefore },
    workflow: JSON.parse(JSON.stringify(workflowSnapshot)),
  };
}

async function submitGeneration(workflowInput, retryOf = '') {
  if (!apiConfig.apiKey || !apiConfig.model) {
    announce('請先開啟 API 設定，填入 Ark API Key 與模型／Endpoint ID。', 'error');
    showApiModal();
    return;
  }
  if (retryOf && submitting.has(retryOf)) return;
  let workflowSnapshot;
  try { workflowSnapshot = parseWorkflow(workflowInput); } catch (error) {
    announce(`無法提交工作流：${error.message}`, 'error');
    return;
  }
  let entry;
  try { entry = createGenerationEntry(workflowSnapshot, retryOf); } catch (error) {
    announce(`無法提交參考資產：${error.message}`, 'error');
    return;
  }
  const policyCheck = evaluateGenerationPolicy({ entry, history, policy: generationPolicy });
  if (!policyCheck.ok) {
    announce(`用量護欄：${policyCheck.message}`, 'error');
    return;
  }
  if (policyCheck.requiresConfirmation && !window.confirm(policyCheck.confirmationMessage)) {
    announce(`${entry.version} 已取消送出。`, 'error');
    return;
  }
  if (retryOf) submitting.add(retryOf);
  history.unshift(entry);
  persistHistory();
  renderHistory();
  generateButton.disabled = true;
  announce(`${entry.version} 已送出，等待 Seedance 任務排隊。`);
  try {
    const response = await fetch('/api/generations', { method: 'POST', headers: apiHeaders(), body: JSON.stringify({ model: entry.model, prompt: entry.prompt, ratio: entry.ratio, duration: entry.duration, referenceImages: entry.referenceImages }) });
    const created = await responseJson(response);
    entry.taskId = created.id;
    entry.status = created.status || 'queued';
    entry.pollStartedAt = new Date().toISOString();
    entry.updatedAt = new Date().toISOString();
    persistEntry(entry);
    schedulePoll(entry, 1000);
  } catch (error) {
    entry.errorCode = error.code || '';
    entry.requestId = error.requestId || '';
    finishGeneration(entry, 'failed', error.message || '無法送出 Seedance 任務。');
  } finally {
    if (retryOf) submitting.delete(retryOf);
    generateButton.disabled = false;
    renderHistory();
  }
}

function generateVideo() {
  submitGeneration(workflow);
}

async function cancelGeneration(entry) {
  if (!entry.taskId || !apiConfig.apiKey) {
    announce('取消任務需要目前分頁中的 Ark API Key。', 'error');
    showApiModal();
    return;
  }
  clearPoll(entry);
  const previousStatus = entry.status;
  entry.status = 'cancelling';
  entry.updatedAt = new Date().toISOString();
  persistEntry(entry);
  try {
    const response = await fetch(`/api/generations/${encodeURIComponent(entry.taskId)}`, { method: 'DELETE', headers: apiHeaders() });
    const task = await responseJson(response);
    entry.videoUrl = task.videoUrl || entry.videoUrl || '';
    entry.lastFrameUrl = task.lastFrameUrl || entry.lastFrameUrl || '';
    entry.usage = task.usage || entry.usage || null;
    const finalStatus = ['succeeded', 'failed', 'expired', 'cancelled'].includes(task.status) ? task.status : 'cancelled';
    finishGeneration(entry, finalStatus, task.error?.message || '已取消。');
  } catch (error) {
    entry.status = previousStatus;
    entry.errorCode = error.code || '';
    entry.requestId = error.requestId || '';
    persistEntry(entry);
    announce(`${entry.version} 取消失敗：${error.message || '請稍後重試。'}`, 'error');
    schedulePoll(entry, 1000);
  }
}

function retryGeneration(entry) {
  if (!entry.workflow) {
    announce(`${entry.version} 缺少工作流快照，無法重試。`, 'error');
    return;
  }
  submitGeneration(entry.workflow, entry.id);
}

function useLastFrame(entry) {
  if (!entry.lastFrameUrl || !/^https:\/\//i.test(entry.lastFrameUrl)) {
    announce(`${entry.version} 沒有可用的 HTTPS 尾幀。`, 'error');
    return;
  }
  let assetNode = workflow.nodes.find((node) => node.type === 'asset');
  if (!assetNode) {
    assetNode = createNode('asset', workflow.nodes.length + 1);
    assetNode.x = 650;
    assetNode.y = 560;
    workflow.nodes.push(assetNode);
  }
  clearAssetPreview(assetNode.id);
  assetNode.values.role = '首幀參考';
  assetNode.values.referenceUrl = entry.lastFrameUrl;
  assetNode.values.notes = `來自 ${entry.version} 的影片尾幀，作為下一段首幀。`;
  selectedId = assetNode.id;
  renderCanvas();
  renderInspector();
  renderOutput();
  persist();
  announce(`${entry.version} 尾幀已填入 Reference 節點，可生成下一段。`);
}

function resumePendingGenerations() {
  if (!apiConfig.apiKey) return;
  history.filter((entry) => entry.taskId && ['queued', 'running'].includes(entry.status)).forEach((entry) => pollGeneration(entry));
}

function renderTimeline() {
  const timeline = $('#timeline');
  const beats = beatLines(workflow.nodes);
  const names = ['HOOK', 'DEVELOP', 'ESCALATE', 'PAYOFF'];
  timeline.replaceChildren();
  beats.forEach((beat, index) => {
    const card = document.createElement('div');
    card.className = 'beat';
    const time = beat.split('：')[0] || ['00-06', '06-14', '14-24', '24-30'][index];
    const copy = beat.includes('：') ? beat.slice(beat.indexOf('：') + 1) : beat;
    card.innerHTML = `<div class="beat-time">${time}</div><div class="beat-name">${names[index]}</div><div class="beat-copy"></div>`;
    card.querySelector('.beat-copy').textContent = copy;
    timeline.append(card);
  });
}

function setSelected(id) {
  selectedId = id;
  canvas.querySelectorAll('.flow-node').forEach((node) => node.classList.toggle('is-selected', node.dataset.nodeId === selectedId));
  renderInspector();
}

function addNode(type) {
  const node = createNode(type, workflow.nodes.length + 1);
  node.x = 80 + (workflow.nodes.length % 3) * 250;
  node.y = 100 + (Math.floor(workflow.nodes.length / 3) % 3) * 230;
  workflow.nodes.push(node);
  selectedId = node.id;
  renderCanvas();
  renderInspector();
  renderOutput();
  persist();
  announce(`${metaFor(node).title} 節點已加入畫布。`);
}

function deleteSelected() {
  const node = selectedNode();
  if (!node) return;
  clearAssetPreview(node.id);
  workflow.nodes = workflow.nodes.filter((item) => item.id !== node.id);
  selectedId = workflow.nodes.at(-1)?.id || null;
  renderCanvas();
  renderInspector();
  renderOutput();
  persist();
  announce(`${metaFor(node).title} 節點已移除。`);
}

async function copyPrompt() {
  const prompt = promptOutput.textContent;
  try {
    await navigator.clipboard.writeText(prompt);
    announce('提示詞已複製到剪貼簿。');
  } catch {
    promptOutput.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(promptOutput);
    selection?.removeAllRanges();
    selection?.addRange(range);
    announce('剪貼簿被瀏覽器拒絕；已選取提示詞，請按 Ctrl/Cmd+C。', 'error');
  }
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function exportWorkflow() {
  downloadFile('seedance-flow-workflow.json', serializeWorkflow(workflow), 'application/json;charset=utf-8');
  announce('工作流 JSON 已下載。');
}

function downloadPrompt() {
  downloadFile('seedance-flow-prompt.txt', promptOutput.textContent, 'text/plain;charset=utf-8');
  announce('提示詞文字檔已下載。');
}

function resetWorkflow() {
  assetPreviews.forEach((_preview, nodeId) => clearAssetPreview(nodeId));
  workflow = createDefaultWorkflow();
  selectedId = workflow.nodes[0]?.id || null;
  renderAll();
  persist();
  announce('已還原預設四拍範例。');
}

function renderAll() {
  renderLibrary();
  renderCanvas();
  renderInspector();
  renderOutput();
  renderHistory();
}

$('#node-library').addEventListener('click', (event) => {
  const button = event.target.closest('[data-add-node]');
  if (button) addNode(button.dataset.addNode);
});

canvas.addEventListener('click', (event) => {
  const node = event.target.closest('[data-node-id]');
  if (node) setSelected(node.dataset.nodeId);
});

canvas.addEventListener('pointerdown', (event) => {
  const handle = event.target.closest('[data-drag-handle]');
  const nodeEl = event.target.closest('[data-node-id]');
  if (!handle || !nodeEl) return;
  const node = workflow.nodes.find((item) => item.id === nodeEl.dataset.nodeId);
  if (!node) return;
  setSelected(node.id);
  dragState = { id: node.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: node.x, originY: node.y };
  handle.setPointerCapture?.(event.pointerId);
  event.preventDefault();
});

canvas.addEventListener('pointermove', (event) => {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const nodeEl = canvas.querySelector(`[data-node-id="${CSS.escape(dragState.id)}"]`);
  const node = workflow.nodes.find((item) => item.id === dragState.id);
  if (!node || !nodeEl) return;
  node.x = Math.max(18, dragState.originX + (event.clientX - dragState.startX) / zoom);
  node.y = Math.max(48, dragState.originY + (event.clientY - dragState.startY) / zoom);
  nodeEl.style.left = `${Math.round(node.x)}px`;
  nodeEl.style.top = `${Math.round(node.y)}px`;
  renderEdges();
});

canvas.addEventListener('pointerup', (event) => {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  dragState = null;
  persist();
});

inspectorForm.addEventListener('input', (event) => {
  const input = event.target.closest('[data-field-key]');
  const node = selectedNode();
  if (!input || !node) return;
  node.values[input.dataset.fieldKey] = input.value;
  const nodeEl = canvas.querySelector(`[data-node-id="${CSS.escape(node.id)}"]`);
  if (nodeEl) nodeEl.querySelector('.node-preview').textContent = previewFor(node);
  renderOutput();
  persist();
});

inspectorForm.addEventListener('change', (event) => {
  const input = event.target.closest('[data-field-key]');
  const node = selectedNode();
  if (!input || !node) return;
  node.values[input.dataset.fieldKey] = input.value;
  const nodeEl = canvas.querySelector(`[data-node-id="${CSS.escape(node.id)}"]`);
  if (nodeEl) nodeEl.querySelector('.node-preview').textContent = previewFor(node);
  renderOutput();
  persist();
});

deleteButton.addEventListener('click', deleteSelected);
$('#copy-prompt').addEventListener('click', copyPrompt);
$('#download-prompt').addEventListener('click', downloadPrompt);
$('#export-workflow').addEventListener('click', exportWorkflow);
$('#reset-workflow').addEventListener('click', resetWorkflow);
$('#generate-video').addEventListener('click', generateVideo);
versionHistory.addEventListener('click', (event) => {
  const cancelButton = event.target.closest('[data-cancel-history]');
  const retryButton = event.target.closest('[data-retry-history]');
  const frameButton = event.target.closest('[data-use-last-frame]');
  const entryId = cancelButton?.dataset.cancelHistory || retryButton?.dataset.retryHistory || frameButton?.dataset.useLastFrame;
  if (!entryId) return;
  const entry = history.find((item) => item.id === entryId);
  if (!entry) return;
  if (cancelButton) cancelGeneration(entry);
  if (retryButton) retryGeneration(entry);
  if (frameButton) useLastFrame(entry);
});
$('#open-api-panel').addEventListener('click', showApiModal);
$('#close-api-panel').addEventListener('click', hideApiModal);
$('#save-api-config').addEventListener('click', saveApiConfig);
$('#clear-api-config').addEventListener('click', clearApiConfig);
apiModal.addEventListener('click', (event) => { if (event.target === apiModal) hideApiModal(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !apiModal.hidden) hideApiModal(); });

$('#zoom-in').addEventListener('click', () => {
  zoom = Math.min(1.25, Number((zoom + .1).toFixed(2)));
  canvas.style.transform = `scale(${zoom})`;
  zoomLevel.textContent = `${Math.round(zoom * 100)}%`;
});

$('#zoom-out').addEventListener('click', () => {
  zoom = Math.max(.75, Number((zoom - .1).toFixed(2)));
  canvas.style.transform = `scale(${zoom})`;
  zoomLevel.textContent = `${Math.round(zoom * 100)}%`;
});

document.addEventListener('keydown', (event) => {
  if ((event.key === 'Delete' || event.key === 'Backspace') && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) deleteSelected();
});

window.addEventListener('resize', renderEdges);
viewport.addEventListener('scroll', renderEdges);

renderAll();
