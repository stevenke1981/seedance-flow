export const POLICY_STORAGE_KEY = 'seedance-flow-generation-policy-v1';

export const DEFAULT_GENERATION_POLICY = Object.freeze({
  maxDurationSeconds: 180,
  dailyTaskLimit: 10,
  dailyDurationLimitSeconds: 900,
  requireConfirmation: true,
});

const LIMITS = Object.freeze({
  maxDurationSeconds: { min: 1, max: 180 },
  dailyTaskLimit: { min: 1, max: 100 },
  dailyDurationLimitSeconds: { min: 1, max: 3600 },
});

function clampInteger(value, { min, max }, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

export function normalizeGenerationPolicy(value = {}) {
  const input = value && typeof value === 'object' ? value : {};
  return {
    maxDurationSeconds: clampInteger(input.maxDurationSeconds, LIMITS.maxDurationSeconds, DEFAULT_GENERATION_POLICY.maxDurationSeconds),
    dailyTaskLimit: clampInteger(input.dailyTaskLimit, LIMITS.dailyTaskLimit, DEFAULT_GENERATION_POLICY.dailyTaskLimit),
    dailyDurationLimitSeconds: clampInteger(input.dailyDurationLimitSeconds, LIMITS.dailyDurationLimitSeconds, DEFAULT_GENERATION_POLICY.dailyDurationLimitSeconds),
    requireConfirmation: input.requireConfirmation !== false,
  };
}

export function localDayKey(value = Date.now()) {
  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = safeDate.getFullYear();
  const month = String(safeDate.getMonth() + 1).padStart(2, '0');
  const day = String(safeDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function summarizeDailyUsage(history = [], now = Date.now()) {
  const date = localDayKey(now);
  return history.reduce((summary, entry) => {
    if (!entry) return summary;
    const createdAt = new Date(entry.createdAt);
    if (Number.isNaN(createdAt.getTime()) || localDayKey(createdAt) !== date) return summary;
    const duration = Number(entry.duration);
    summary.taskCount += 1;
    summary.durationSeconds += Number.isFinite(duration) ? Math.max(0, Math.round(duration)) : 0;
    return summary;
  }, { date, taskCount: 0, durationSeconds: 0 });
}

function durationLabel(seconds) {
  return `${seconds} 秒`;
}

export function evaluateGenerationPolicy({ entry = {}, history = [], policy = DEFAULT_GENERATION_POLICY, now = Date.now() } = {}) {
  const normalizedPolicy = normalizeGenerationPolicy(policy);
  const usage = summarizeDailyUsage(history, now);
  const duration = Number(entry.duration);
  const requestedDuration = Number.isFinite(duration) ? Math.max(0, Math.round(duration)) : 0;
  const nextTaskCount = usage.taskCount + 1;
  const nextDurationSeconds = usage.durationSeconds + requestedDuration;
  const base = { policy: normalizedPolicy, usage, requestedDuration, nextTaskCount, nextDurationSeconds };

  if (!requestedDuration || requestedDuration > normalizedPolicy.maxDurationSeconds) {
    return { ...base, ok: false, code: 'MAX_DURATION_EXCEEDED', message: `本次時長 ${durationLabel(requestedDuration)} 超過本機上限 ${durationLabel(normalizedPolicy.maxDurationSeconds)}。` };
  }
  if (nextTaskCount > normalizedPolicy.dailyTaskLimit) {
    return { ...base, ok: false, code: 'DAILY_TASK_LIMIT', message: `已達今日任務上限 ${normalizedPolicy.dailyTaskLimit} 次；為避免意外費用，今日暫停送出。` };
  }
  if (nextDurationSeconds > normalizedPolicy.dailyDurationLimitSeconds) {
    return { ...base, ok: false, code: 'DAILY_DURATION_LIMIT', message: `本次會使今日累計達 ${durationLabel(nextDurationSeconds)}，超過上限 ${durationLabel(normalizedPolicy.dailyDurationLimitSeconds)}。` };
  }

  return {
    ...base,
    ok: true,
    requiresConfirmation: normalizedPolicy.requireConfirmation,
    confirmationMessage: `即將送出 ${entry.version || '本次'} ${durationLabel(requestedDuration)} 影片生成請求。供應商可能依模型、時長與輸入收費；本機只提供用量護欄，不會估算或承諾美元金額。\n\n今日送出後：${nextTaskCount}/${normalizedPolicy.dailyTaskLimit} 次、${durationLabel(nextDurationSeconds)}/${durationLabel(normalizedPolicy.dailyDurationLimitSeconds)}。確認送出？`,
  };
}
