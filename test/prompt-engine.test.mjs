import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, beatLines, createDefaultWorkflow, parseWorkflow, serializeWorkflow } from '../src/prompt-engine.mjs';

test('default workflow creates seven editable nodes', () => {
  const workflow = createDefaultWorkflow();
  assert.equal(workflow.nodes.length, 7);
  assert.deepEqual(workflow.nodes.map((node) => node.type), ['scene', 'character', 'camera', 'motion', 'style', 'audio', 'output']);
});

test('prompt output contains Seedance structure and four beats', () => {
  const workflow = createDefaultWorkflow();
  const prompt = buildPrompt(workflow.nodes, workflow);
  assert.match(prompt, /Seedance 2\.5/);
  assert.match(prompt, /主體：一名穿著深色雨衣的台北郵差/);
  assert.match(prompt, /鏡頭：廣角建立鏡頭/);
  assert.match(prompt, /聲音：雨聲/);
  assert.equal(beatLines(workflow.nodes).length, 4);
  assert.doesNotMatch(prompt, /undefined|null/);
});

test('workflow serialization round-trips without losing node fields', () => {
  const workflow = createDefaultWorkflow();
  workflow.nodes[0].values.subject = '一台在海邊巡航的橘色機器人';
  const serialized = serializeWorkflow(workflow);
  const restored = parseWorkflow(serialized);
  assert.equal(restored.nodes[0].values.subject, '一台在海邊巡航的橘色機器人');
  assert.equal(restored.model, 'Seedance 2.5');
});

test('invalid workflow payloads fail loudly', () => {
  assert.throws(() => parseWorkflow('{"nodes":[]}'), /至少需要一個節點/);
  assert.throws(() => parseWorkflow('{"model":"Seedance 2.5"}'), /缺少 nodes 陣列/);
});
