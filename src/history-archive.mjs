export const HISTORY_ARCHIVE_SCHEMA_VERSION = 1;
export const HISTORY_ARCHIVE_KIND = 'seedance-flow-history';
export const HISTORY_ARCHIVE_LIMITS = Object.freeze({
  maxEntries: 40,
  maxSerializedBytes: 2_000_000,
});

const EXPORT_FIELDS = [
  'id', 'version', 'prompt', 'promptHash', 'model', 'ratio', 'duration', 'referenceImages',
  'status', 'taskId', 'videoUrl', 'lastFrameUrl', 'errorMessage', 'errorCode', 'requestId',
  'createdAt', 'updatedAt', 'pollStartedAt', 'pollRetries', 'retryOf', 'usage', 'guardrail', 'workflow',
];
function isSensitiveKey(key) {
  const normalized = String(key).replace(/[^a-z0-9]/gi, '').toLowerCase();
  return normalized.endsWith('apikey')
    || normalized.endsWith('accesstoken')
    || normalized.endsWith('authorization')
    || normalized.endsWith('password')
    || normalized.endsWith('secret')
    || normalized.endsWith('token');
}

function scrubSensitive(value) {
  if (Array.isArray(value)) return value.map(scrubSensitive);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !isSensitiveKey(key)).map(([key, nested]) => [key, scrubSensitive(nested)]));
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  try { return scrubSensitive(JSON.parse(JSON.stringify(value))); } catch { return undefined; }
}

function exportEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const safe = {};
  EXPORT_FIELDS.forEach((field) => {
    const value = cloneJson(entry[field]);
    if (value !== undefined) safe[field] = value;
  });
  return safe;
}

export function sanitizeHistoryEntry(entry) {
  return exportEntry(entry);
}

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

export function serializeHistoryArchive(entries, exportedAt = new Date().toISOString()) {
  if (!Array.isArray(entries)) throw new Error('版本歷史格式無效：entries 必須是陣列。');
  const payload = {
    schemaVersion: HISTORY_ARCHIVE_SCHEMA_VERSION,
    kind: HISTORY_ARCHIVE_KIND,
    exportedAt,
    entries: entries.slice(0, HISTORY_ARCHIVE_LIMITS.maxEntries).map(exportEntry).filter(Boolean),
  };
  const serialized = JSON.stringify(payload, null, 2);
  if (byteLength(serialized) > HISTORY_ARCHIVE_LIMITS.maxSerializedBytes) {
    throw new Error(`版本歷史格式無效：archive 不可超過 ${HISTORY_ARCHIVE_LIMITS.maxSerializedBytes} bytes。`);
  }
  return serialized;
}

export function parseHistoryArchive(serialized) {
  if (typeof serialized !== 'string' || byteLength(serialized) > HISTORY_ARCHIVE_LIMITS.maxSerializedBytes) {
    throw new Error('版本歷史格式無效：檔案過大或不是文字。');
  }
  let parsed;
  try { parsed = JSON.parse(serialized); } catch { throw new Error('版本歷史格式無效：無法解析 JSON。'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.schemaVersion !== HISTORY_ARCHIVE_SCHEMA_VERSION || parsed.kind !== HISTORY_ARCHIVE_KIND || !Array.isArray(parsed.entries)) {
    throw new Error('版本歷史格式無效：schemaVersion 或 kind 不相容。');
  }
  if (parsed.entries.length > HISTORY_ARCHIVE_LIMITS.maxEntries) {
    throw new Error(`版本歷史格式無效：不可超過 ${HISTORY_ARCHIVE_LIMITS.maxEntries} 個版本。`);
  }
  if (parsed.entries.some((entry) => !entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.id !== 'string' || !entry.id || entry.id.length > 160)) {
    throw new Error('版本歷史格式無效：包含缺少 id 或 id 過長的紀錄。');
  }
  return parsed.entries.map(sanitizeHistoryEntry);
}

export function mergeHistoryEntries(current, imported) {
  const existing = Array.isArray(current) ? current : [];
  const incoming = Array.isArray(imported) ? imported : [];
  const seen = new Set();
  return [...incoming, ...existing]
    .filter((entry) => {
      if (!entry || typeof entry.id !== 'string' || seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    })
    .slice(0, HISTORY_ARCHIVE_LIMITS.maxEntries);
}
