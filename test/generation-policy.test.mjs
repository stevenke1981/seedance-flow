import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GENERATION_POLICY, evaluateGenerationPolicy, localDayKey, normalizeGenerationPolicy, summarizeDailyUsage } from '../src/generation-policy.mjs';

test('generation policy normalizes bounded local guardrails', () => {
  assert.deepEqual(normalizeGenerationPolicy({ maxDurationSeconds: 999, dailyTaskLimit: 0, dailyDurationLimitSeconds: '120', requireConfirmation: false }), {
    maxDurationSeconds: 180,
    dailyTaskLimit: 1,
    dailyDurationLimitSeconds: 120,
    requireConfirmation: false,
  });
  assert.deepEqual(normalizeGenerationPolicy(null), DEFAULT_GENERATION_POLICY);
});

test('generation policy summarizes only the current local day', () => {
  const now = new Date(2026, 7, 2, 12, 0, 0);
  const history = [
    { createdAt: new Date(2026, 7, 2, 8, 0, 0).toISOString(), duration: 30 },
    { createdAt: new Date(2026, 7, 1, 23, 59, 0).toISOString(), duration: 120 },
  ];
  assert.equal(localDayKey(now), '2026-08-02');
  assert.deepEqual(summarizeDailyUsage(history, now), { date: '2026-08-02', taskCount: 1, durationSeconds: 30 });
});

test('generation policy blocks duration and daily quotas before a paid request', () => {
  const policy = { maxDurationSeconds: 60, dailyTaskLimit: 2, dailyDurationLimitSeconds: 80, requireConfirmation: true };
  const now = new Date(2026, 7, 2, 12, 0, 0);
  const history = [{ createdAt: now.toISOString(), duration: 30 }];
  const tooLong = evaluateGenerationPolicy({ entry: { version: 'v002', duration: 61 }, history, policy, now });
  assert.equal(tooLong.ok, false);
  assert.equal(tooLong.code, 'MAX_DURATION_EXCEEDED');

  const overDaily = evaluateGenerationPolicy({ entry: { version: 'v002', duration: 60 }, history, policy, now });
  assert.equal(overDaily.ok, false);
  assert.equal(overDaily.code, 'DAILY_DURATION_LIMIT');

  const allowed = evaluateGenerationPolicy({ entry: { version: 'v002', duration: 30 }, history, policy, now });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.requiresConfirmation, true);
  assert.match(allowed.confirmationMessage, /供應商可能依模型、時長與輸入收費/);
});
