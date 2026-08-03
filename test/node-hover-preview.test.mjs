import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNodeHoverPreviewFields, normalizeNodeHoverPreviewPreference } from '../src/node-hover-preview.mjs';

test('node hover preview preference defaults on and only disables for false', () => {
  assert.equal(normalizeNodeHoverPreviewPreference(null), true);
  assert.equal(normalizeNodeHoverPreviewPreference('true'), true);
  assert.equal(normalizeNodeHoverPreviewPreference('false'), false);
});

test('node hover preview fields preserve order and normalize empty values', () => {
  const fields = buildNodeHoverPreviewFields({ values: { subject: '  夜行列車  ', beats: '' } }, [
    { key: 'subject', label: '主體', type: 'text' },
    { key: 'beats', label: '四拍節奏', type: 'textarea' },
  ]);
  assert.deepEqual(fields, [
    { key: 'subject', label: '主體', type: 'text', value: '夜行列車' },
    { key: 'beats', label: '四拍節奏', type: 'textarea', value: '尚未設定' },
  ]);
});

test('node hover preview fields handle malformed nodes without throwing', () => {
  assert.deepEqual(buildNodeHoverPreviewFields(null, null), []);
  assert.deepEqual(buildNodeHoverPreviewFields({}, [{ key: 'unknown' }]), [
    { key: 'unknown', label: 'unknown', type: 'text', value: '尚未設定' },
  ]);
});
